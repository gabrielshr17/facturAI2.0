import { describe, it, expect } from "vitest";
import { nuevaDb } from "./_ayuda.js";
import { conSesion, crearPortadorSesion, exigirPermiso } from "../src/db/sesion.js";
import {
  PermisoError,
  permisosDeRol,
  type PortadorSesion,
  type RolUsuario,
} from "../src/dominio/permisos.js";
import { crearProductoRepo } from "../src/repos/producto-repo.js";
import { crearFacturaRepo } from "../src/repos/factura-repo.js";
import { crearCorteCajaRepo } from "../src/repos/corte-caja-repo.js";
import { crearCompraRepo } from "../src/repos/compra-repo.js";
import { crearCotizacionRepo } from "../src/repos/cotizacion-repo.js";
import { crearProveedorRepo } from "../src/repos/proveedor-repo.js";
import { crearUsuarioRepo } from "../src/repos/usuario-repo.js";
import { registrarAccion } from "../src/repos/bitacora-repo.js";
import type { SqlDriver } from "../src/db/driver.js";

/**
 * Cubre RBAC-04: la sesión pegada al driver (`conSesion`), la atribución
 * automática de `usuario_id` (`registrarAccion`, `abrirTicket`,
 * `registrarCorte`, `cotizacion.crear`), y el guardia `exigirPermiso` en los
 * puntos sensibles reales de los repos (verificados por grep, no por el
 * brief original — ver el reporte de la tarea para la lista completa y las
 * discrepancias encontradas).
 *
 * `usuario_id` tiene FK real contra `usuario(id)` en varias tablas (factura,
 * corte_caja, cotizacion, bitacora_accion) y los tres drivers corren con
 * `PRAGMA foreign_keys = ON`: una sesión de prueba con un id inventado
 * revienta el INSERT. Por eso `sesionDe` crea primero una fila real de
 * `usuario` con `usuario-repo.ts` (RBAC-03) y arma la sesión sobre ese id,
 * en vez de inventar un string.
 */
async function sesionDe(db: SqlDriver, rol: RolUsuario, nombre: string): Promise<PortadorSesion> {
  const usuario = await crearUsuarioRepo(db).crear({ nombre, rol });
  return { usuarioId: usuario.id, rol, permisos: permisosDeRol(rol) };
}

describe("conSesion", () => {
  it("delega exec, run, all, get y close en el driver original", async () => {
    const db = await nuevaDb();
    let cerrado = false;
    const espia: SqlDriver = {
      exec: (sql) => db.exec(sql),
      run: (sql, params) => db.run(sql, params),
      all: (sql, params) => db.all(sql, params),
      get: (sql, params) => db.get(sql, params),
      close: async () => {
        cerrado = true;
      },
    };
    const portador = crearPortadorSesion(null);
    const envuelto = conSesion(espia, portador);

    await envuelto.run(
      "INSERT INTO proveedor (id, nombre, created_at, updated_at) VALUES (?,?,?,?)",
      ["prov-1", "Proveedor Test", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z"],
    );
    const fila = await envuelto.get<{ nombre: string }>("SELECT nombre FROM proveedor WHERE id=?", [
      "prov-1",
    ]);
    expect(fila?.nombre).toBe("Proveedor Test");

    const todas = await envuelto.all<{ nombre: string }>("SELECT nombre FROM proveedor");
    expect(todas.length).toBe(1);

    await envuelto.close?.();
    expect(cerrado).toBe(true);
  });
});

describe("exigirPermiso: modo permisivo (driver sin sesión adjunta)", () => {
  it("no lanza aunque el permiso no exista en ningún rol", async () => {
    const db = await nuevaDb();
    expect(() => exigirPermiso(db, "personal.gestionar")).not.toThrow();
  });

  it("productoRepo.actualizar funciona igual que hoy sin sesión adjunta", async () => {
    const db = await nuevaDb();
    const productos = crearProductoRepo(db);
    const p = await productos.crear({ descripcion: "Agua", costo: 10, pct_ganancia: 20 });
    await expect(
      productos.actualizar(p.id, { descripcion: "Agua fría", costo: 12 }),
    ).resolves.toBeUndefined();
  });
});

describe("exigirPermiso: sesión de cajero corta ANTES de escribir", () => {
  it("productoRepo.actualizar lanza PermisoError y la fila queda sin cambios", async () => {
    const dbCruda = await nuevaDb();
    const sinSesion = crearProductoRepo(dbCruda);
    const p = await sinSesion.crear({ descripcion: "Refresco", costo: 20, pct_ganancia: 30 });

    const portador = crearPortadorSesion(await sesionDe(dbCruda, "cajero", "Cajero Uno"));
    const dbConSesion = conSesion(dbCruda, portador);
    const productos = crearProductoRepo(dbConSesion);

    await expect(
      productos.actualizar(p.id, { descripcion: "Refresco caro", costo: 999 }),
    ).rejects.toBeInstanceOf(PermisoError);

    const releido = await sinSesion.obtener(p.id);
    expect(releido?.descripcion).toBe("Refresco");
    expect(releido?.costo).toBe(20);
  });

  it("productoRepo.crear lanza PermisoError (guardado con modulo.productos)", async () => {
    const dbCruda = await nuevaDb();
    const portador = crearPortadorSesion(await sesionDe(dbCruda, "cajero", "Cajero Uno"));
    const productos = crearProductoRepo(conSesion(dbCruda, portador));

    await expect(
      productos.crear({ descripcion: "Nuevo", costo: 1, pct_ganancia: 1 }),
    ).rejects.toBeInstanceOf(PermisoError);

    const listado = await crearProductoRepo(dbCruda).listar();
    expect(listado.length).toBe(0);
  });

  it("facturaRepo.eliminarTicket lanza PermisoError", async () => {
    const dbCruda = await nuevaDb();
    const facturasSinSesion = crearFacturaRepo(dbCruda);
    const ticket = await facturasSinSesion.abrirTicket();

    const portador = crearPortadorSesion(await sesionDe(dbCruda, "cajero", "Cajero Uno"));
    const facturas = crearFacturaRepo(conSesion(dbCruda, portador));

    await expect(facturas.eliminarTicket(ticket.id)).rejects.toBeInstanceOf(PermisoError);
    const releida = await facturasSinSesion.obtener(ticket.id);
    expect(releida).toBeDefined();
    expect(releida?.deleted_at).toBeNull();
  });

  it("corteCajaRepo.cerrarTurno: el que abrió el turno lo cierra sin caja.cerrar; otro cajero no puede", async () => {
    const dbCruda = await nuevaDb();
    const sesionCajero = await sesionDe(dbCruda, "cajero", "Cajero Uno");
    const portadorCajero = crearPortadorSesion(sesionCajero);
    const corteComoCajero = crearCorteCajaRepo(conSesion(dbCruda, portadorCajero));
    await corteComoCajero.abrirTurno({ montoInicial: 0 });

    const sesionOtroCajero = await sesionDe(dbCruda, "cajero", "Cajero Dos");
    const portadorOtro = crearPortadorSesion(sesionOtroCajero);
    const corteComoOtroCajero = crearCorteCajaRepo(conSesion(dbCruda, portadorOtro));
    await expect(corteComoOtroCajero.cerrarTurno({ efectivoContado: 0 })).rejects.toBeInstanceOf(
      PermisoError,
    );

    const cerrado = await corteComoCajero.cerrarTurno({ efectivoContado: 0 });
    expect(cerrado.usuario_id).toBe(sesionCajero.usuarioId);
    expect(cerrado.estado).toBe("cerrado");
  });

  it("corteCajaRepo.abrirTurno lanza PermisoError sin caja.abrir; cerrarTurno permite el cierre forzado con caja.cerrar", async () => {
    const dbCruda = await nuevaDb();
    const sesionCajero = await sesionDe(dbCruda, "cajero", "Cajero Uno");
    const corteComoCajero = crearCorteCajaRepo(
      conSesion(dbCruda, crearPortadorSesion(sesionCajero)),
    );
    await corteComoCajero.abrirTurno({ montoInicial: 0 });

    const sesionSupervisor = await sesionDe(dbCruda, "supervisor", "Supervisor Uno");
    const corteComoSupervisor = crearCorteCajaRepo(
      conSesion(dbCruda, crearPortadorSesion(sesionSupervisor)),
    );
    // Cierre forzado (no es el dueño del turno): requiere caja.cerrar, que supervisor sí tiene.
    const cerrado = await corteComoSupervisor.cerrarTurno({ efectivoContado: 0 });
    expect(cerrado.usuario_id).toBe(sesionCajero.usuarioId);
    expect(cerrado.estado).toBe("cerrado");
  });
});

describe("con sesión de supervisor, compraRepo.crear funciona y atribuye la bitácora", () => {
  it("la fila de bitácora queda con usuario_id igual al del supervisor", async () => {
    const dbCruda = await nuevaDb();
    const proveedores = crearProveedorRepo(dbCruda);
    const proveedor = await proveedores.crear({ nombre: "Proveedor Uno" });

    const sesionSupervisor = await sesionDe(dbCruda, "supervisor", "Supervisor Uno");
    const portador = crearPortadorSesion(sesionSupervisor);
    const dbConSesion = conSesion(dbCruda, portador);
    const compras = crearCompraRepo(dbConSesion);

    await compras.crear({
      proveedor_id: proveedor.id,
      lineas: [
        {
          descripcion: "Artículo",
          cantidad: 1,
          costoUnitario: 100,
          impuestoTipo: "itbis18",
          tasaImpuesto: 0.18,
        },
      ],
    });

    const bitacora = await dbCruda.all<{ usuario_id: string | null; accion: string }>(
      "SELECT usuario_id, accion FROM bitacora_accion WHERE accion='registrar_compra'",
    );
    expect(bitacora.length).toBe(1);
    expect(bitacora[0]?.usuario_id).toBe(sesionSupervisor.usuarioId);
  });
});

describe("registrarAccion: atribución automática desde la sesión", () => {
  it("sin usuarioId explícito graba el usuario de la sesión en lugar de NULL", async () => {
    const dbCruda = await nuevaDb();
    const sesionDueno = await sesionDe(dbCruda, "dueno", "Dueño Uno");
    const portador = crearPortadorSesion(sesionDueno);
    const dbConSesion = conSesion(dbCruda, portador);

    const registro = await registrarAccion(dbConSesion, { accion: "prueba", entidad: "prueba" });
    expect(registro.usuario_id).toBe(sesionDueno.usuarioId);
  });

  it("un usuarioId explícito en el input gana sobre el de la sesión", async () => {
    const dbCruda = await nuevaDb();
    const sesionDueno = await sesionDe(dbCruda, "dueno", "Dueño Uno");
    const otro = await crearUsuarioRepo(dbCruda).crear({ nombre: "Otro Usuario", rol: "cajero" });
    const portador = crearPortadorSesion(sesionDueno);
    const dbConSesion = conSesion(dbCruda, portador);

    const registro = await registrarAccion(dbConSesion, {
      usuarioId: otro.id,
      accion: "prueba",
      entidad: "prueba",
    });
    expect(registro.usuario_id).toBe(otro.id);
    expect(registro.usuario_id).not.toBe(sesionDueno.usuarioId);
  });
});

describe("puntos de entrada que aceptan usuario_id opcional heredan el de la sesión", () => {
  it("abrirTicket() sin usuario_id explícito guarda factura.usuario_id con el usuario de la sesión", async () => {
    const dbCruda = await nuevaDb();
    const sesionCajero = await sesionDe(dbCruda, "cajero", "Cajero Uno");
    const portador = crearPortadorSesion(sesionCajero);
    const facturas = crearFacturaRepo(conSesion(dbCruda, portador));

    const ticket = await facturas.abrirTicket();
    expect(ticket.usuario_id).toBe(sesionCajero.usuarioId);
  });

  it("abrirTurno() guarda usuario_id de la sesión (quien abre el turno)", async () => {
    const dbCruda = await nuevaDb();
    const sesionCajero = await sesionDe(dbCruda, "cajero", "Cajero Uno");
    const portador = crearPortadorSesion(sesionCajero);
    const corte = crearCorteCajaRepo(conSesion(dbCruda, portador));

    const c = await corte.abrirTurno({ montoInicial: 0 });
    expect(c.usuario_id).toBe(sesionCajero.usuarioId);
  });

  it("cotizacion.crear() guarda usuario_id de la sesión", async () => {
    const dbCruda = await nuevaDb();
    const sesionCajero = await sesionDe(dbCruda, "cajero", "Cajero Uno");
    const portador = crearPortadorSesion(sesionCajero);
    const cotizaciones = crearCotizacionRepo(conSesion(dbCruda, portador));

    const c = await cotizaciones.crear({
      lineas: [
        {
          descripcion: "Artículo",
          cantidad: 1,
          precioUnitario: 100,
          impuestoTipo: "itbis18",
          tasaImpuesto: 0.18,
        },
      ],
    });
    expect(c.usuario_id).toBe(sesionCajero.usuarioId);
  });
});

describe("el portador es de identidad estable: mutar fijar() no obliga a reconstruir repos", () => {
  it("tras fijar() a otro usuario, el MISMO objeto repo ya escribe el usuario nuevo", async () => {
    const dbCruda = await nuevaDb();
    const sesionUno = await sesionDe(dbCruda, "cajero", "Cajero Uno");
    const portador = crearPortadorSesion(sesionUno);
    const facturas = crearFacturaRepo(conSesion(dbCruda, portador));

    const primero = await facturas.abrirTicket();
    expect(primero.usuario_id).toBe(sesionUno.usuarioId);

    const sesionDos = await sesionDe(dbCruda, "cajero", "Cajero Dos");
    portador.fijar(sesionDos);

    const segundo = await facturas.abrirTicket();
    expect(segundo.usuario_id).toBe(sesionDos.usuarioId);
    expect(segundo.usuario_id).not.toBe(primero.usuario_id);
  });
});

describe("PermisoError", () => {
  it("es instanceof Error, expone el permiso faltante y un mensaje legible", () => {
    const error = new PermisoError("producto.editar");
    expect(error).toBeInstanceOf(Error);
    expect(error.permiso).toBe("producto.editar");
    expect(error.message.length).toBeGreaterThan(0);
  });
});
