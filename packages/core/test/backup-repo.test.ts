import { describe, expect, it } from "vitest";
import { nuevaDb, nuevaDbMigrada } from "./_ayuda.js";
import { crearBackupRepo, type RespaldoCompleto } from "../src/repos/backup-repo.js";
import { ValidacionError } from "../src/repos/producto-repo.js";
import { crearUsuarioRepo } from "../src/repos/usuario-repo.js";
import { newId, now } from "../src/ids.js";

/**
 * Pruebas de PLATAFORMA-03: exportarTodo debe descubrir tablas en tiempo de
 * ejecución (sin lista manual) e importarTodo debe restaurar de forma
 * transaccional, incluyendo el caso de FK cruzadas (factura -> cliente/caja,
 * factura_linea -> factura/producto) que ejercita el mecanismo de
 * `PRAGMA defer_foreign_keys` elegido para esta tarea.
 */
describe("backup-repo", () => {
  it("exportarTodo incluye una tabla creada ad-hoc en el test", async () => {
    const db = await nuevaDb();
    await db.exec("CREATE TABLE tabla_ad_hoc (id TEXT PRIMARY KEY, valor TEXT);");
    await db.run("INSERT INTO tabla_ad_hoc (id, valor) VALUES (?, ?)", ["1", "hola"]);

    const repo = crearBackupRepo(db);
    const respaldo = await repo.exportarTodo();

    expect(respaldo.tablas.tabla_ad_hoc).toEqual([{ id: "1", valor: "hola" }]);
  });

  it("exportarTodo excluye _migracion y sqlite_%, y reporta el esquema como el id máximo aplicado", async () => {
    const db = await nuevaDb();
    const repo = crearBackupRepo(db);
    const respaldo = await repo.exportarTodo();

    expect(respaldo.tablas._migracion).toBeUndefined();
    expect(Object.keys(respaldo.tablas).some((t) => t.startsWith("sqlite_"))).toBe(false);

    const maxId = await db.get<{ maximo: number }>("SELECT MAX(id) as maximo FROM _migracion");
    expect(respaldo.esquema).toBe(maxId?.maximo);
  });

  it("ida y vuelta con FK cruzadas: exportar, restaurar en base nueva vacía y comparar filas", async () => {
    const origen = await nuevaDbMigrada();
    const repoOrigen = crearBackupRepo(origen);

    const ts = now();
    const clienteId = newId();
    await origen.run(
      "INSERT INTO cliente (id, nombre, aplica_credito, limite_credito, saldo_credito, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
      [clienteId, "Cliente FK", 0, 0, 0, ts, ts],
    );
    const cajaId = newId();
    await origen.run(
      "INSERT INTO caja (id, nombre, activa, created_at, updated_at) VALUES (?,?,?,?,?)",
      [cajaId, "Caja FK", 1, ts, ts],
    );
    const facturaId = newId();
    await origen.run(
      `INSERT INTO factura (id, fecha_hora, cliente_id, caja_id, tipo, subtotal_gravado, subtotal_exento, total_itbis, total, monto_pagado, cambio, estado, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [facturaId, ts, clienteId, cajaId, "normal", 100, 0, 18, 118, 118, 0, "cobrada", ts, ts],
    );
    const productoRow = await origen.get<{ id: string }>("SELECT id FROM producto LIMIT 1");
    if (!productoRow) throw new Error("el seed debe dejar al menos un producto");
    await origen.run(
      `INSERT INTO factura_linea (id, factura_id, producto_id, descripcion, cantidad, precio_unitario, es_mayoreo, impuesto_tipo, tasa_impuesto, monto_itbis, subtotal, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [newId(), facturaId, productoRow.id, "Línea FK", 1, 100, 0, "itbis18", 0.18, 18, 100, ts, ts],
    );

    const respaldo = await repoOrigen.exportarTodo();

    const destino = await nuevaDb();
    const repoDestino = crearBackupRepo(destino);
    await repoDestino.importarTodo(respaldo);

    // bitacora_accion se excluye de la comparación: importarTodo deja su
    // propia fila `restaurar_respaldo` en el destino, así que diverge del
    // origen a propósito. Se prueba aparte, en el test "bitacora_accion".
    for (const tabla of Object.keys(respaldo.tablas).filter((t) => t !== "bitacora_accion")) {
      const filasOrigen = await origen.all(`SELECT * FROM ${tabla}`);
      const filasDestino = await destino.all(`SELECT * FROM ${tabla}`);
      expect(filasDestino).toEqual(filasOrigen);
    }
  });

  it("rechaza un respaldo de un esquema más nuevo que la base destino, sin escribir nada", async () => {
    const destino = await nuevaDb();
    const repo = crearBackupRepo(destino);
    const antes = await destino.all("SELECT * FROM producto");

    const respaldoFuturo: RespaldoCompleto = {
      version: 1,
      generadoEn: now(),
      esquema: 999999,
      tablas: { producto: [] },
    };

    await expect(repo.importarTodo(respaldoFuturo)).rejects.toThrow(ValidacionError);

    const despues = await destino.all("SELECT * FROM producto");
    expect(despues).toEqual(antes);
  });

  it("rechaza un respaldo que nombra una tabla inexistente, sin escribir nada", async () => {
    const destino = await nuevaDb();
    const repo = crearBackupRepo(destino);
    const antesProducto = await destino.all("SELECT * FROM producto");

    const respaldoInvalido: RespaldoCompleto = {
      version: 1,
      generadoEn: now(),
      esquema: 0,
      tablas: { tabla_que_no_existe: [{ id: "1" }], producto: [] },
    };

    await expect(repo.importarTodo(respaldoInvalido)).rejects.toThrow(ValidacionError);

    const despuesProducto = await destino.all("SELECT * FROM producto");
    expect(despuesProducto).toEqual(antesProducto);
  });

  it("un respaldo sin tablas es rechazado", async () => {
    const destino = await nuevaDb();
    const repo = crearBackupRepo(destino);

    const respaldoSinTablas = {
      version: 1,
      generadoEn: now(),
      esquema: 0,
    } as unknown as RespaldoCompleto;

    await expect(repo.importarTodo(respaldoSinTablas)).rejects.toThrow(ValidacionError);
  });

  it("un fallo a mitad de la importación deja la base con los datos originales (rollback)", async () => {
    const origen = await nuevaDbMigrada();
    const repoOrigen = crearBackupRepo(origen);
    const respaldo = await repoOrigen.exportarTodo();

    respaldo.tablas.departamento = [
      { id: "fila-invalida", nombre: null, activo: 1, created_at: now(), updated_at: now(), deleted_at: null },
    ];

    const destino = await nuevaDbMigrada();
    const repoDestino = crearBackupRepo(destino);
    const productosAntes = await destino.all("SELECT * FROM producto");
    const facturasAntes = await destino.all("SELECT * FROM factura");

    await expect(repoDestino.importarTodo(respaldo)).rejects.toThrow();

    const productosDespues = await destino.all("SELECT * FROM producto");
    const facturasDespues = await destino.all("SELECT * FROM factura");
    expect(productosDespues).toEqual(productosAntes);
    expect(facturasDespues).toEqual(facturasAntes);
  });

  it("deja una fila en bitacora_accion con accion restaurar_respaldo", async () => {
    const origen = await nuevaDbMigrada();
    const repoOrigen = crearBackupRepo(origen);
    const respaldo = await repoOrigen.exportarTodo();

    const destino = await nuevaDb();
    const repoDestino = crearBackupRepo(destino);
    await repoDestino.importarTodo(respaldo);

    const filas = await destino.all<{ accion: string; entidad: string }>(
      "SELECT accion, entidad FROM bitacora_accion WHERE accion = 'restaurar_respaldo'",
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]?.entidad).toBe("respaldo");
  });

  it("importar el mismo respaldo dos veces deja el mismo resultado (no duplica filas)", async () => {
    const origen = await nuevaDbMigrada();
    const repoOrigen = crearBackupRepo(origen);
    const respaldo = await repoOrigen.exportarTodo();

    const destino = await nuevaDb();
    const repoDestino = crearBackupRepo(destino);
    await repoDestino.importarTodo(respaldo);
    await repoDestino.importarTodo(respaldo);

    const productos = await destino.all("SELECT * FROM producto");
    const productosOrigen = await origen.all("SELECT * FROM producto");
    expect(productos).toEqual(productosOrigen);
  });

  /**
   * Casos de RBAC-03 (§ backup-repo.ts, nota de PLATAFORMA-03): ahora que
   * usuario_seguridad existe y pin_hash puede tener valor real, el respaldo
   * tiene que enmascarar el hash y dejar fuera la tabla de control de acceso.
   */
  it("exportarTodo devuelve la tabla usuario con pin_hash null en todas las filas", async () => {
    const db = await nuevaDbMigrada();
    const repo = crearUsuarioRepo(db);
    const usuario = await repo.crear({ nombre: "Con Pin", rol: "cajero", pin: "1234" });

    const backup = crearBackupRepo(db);
    const respaldo = await backup.exportarTodo();

    const filaSemilla = respaldo.tablas.usuario?.find((f) => f.id === "usuario-admin");
    const filaNueva = respaldo.tablas.usuario?.find((f) => f.id === usuario.id);
    expect(filaSemilla?.pin_hash).toBeNull();
    expect(filaNueva?.pin_hash).toBeNull();

    const filaRealEnBase = await db.get<{ pin_hash: string | null }>(
      "SELECT pin_hash FROM usuario WHERE id=?",
      [usuario.id],
    );
    expect(filaRealEnBase?.pin_hash).not.toBeNull();
  });

  it("exportarTodo no incluye la clave usuario_seguridad", async () => {
    const db = await nuevaDbMigrada();
    const repo = crearUsuarioRepo(db);
    await repo.crear({ nombre: "Con Pin", rol: "cajero", pin: "1234" });

    const backup = crearBackupRepo(db);
    const respaldo = await backup.exportarTodo();

    expect(respaldo.tablas.usuario_seguridad).toBeUndefined();
  });
});
