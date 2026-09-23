import { describe, it, expect, beforeEach } from "vitest";
import type { SqlDriver } from "../src/db/driver.js";
import { nuevaDb } from "./_ayuda.js";
import { crearProductoRepo, ValidacionError } from "../src/repos/producto-repo.js";
import { crearClienteRepo } from "../src/repos/cliente-repo.js";
import { crearNegocioRepo } from "../src/repos/negocio-repo.js";
import { crearDepartamentoRepo } from "../src/repos/departamento-repo.js";

describe("productoRepo — CRUD persiste en SQLite", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  it("crea y persiste, derivando el precio del costo", async () => {
    const repo = crearProductoRepo(db);
    const p = await repo.crear({ descripcion: "Arroz 5lb", costo: 40, pct_ganancia: 25 });
    expect(p.precio_venta).toBe(50);

    const leido = await repo.obtener(p.id);
    expect(leido?.descripcion).toBe("Arroz 5lb");
  });

  it("respeta el precio manual (manda sobre la derivación)", async () => {
    const repo = crearProductoRepo(db);
    const p = await repo.crear({
      descripcion: "Refresco",
      costo: 20,
      pct_ganancia: 50,
      precio_venta: 35,
    });
    expect(p.precio_venta).toBe(35);
  });

  it("actualiza y recalcula precio", async () => {
    const repo = crearProductoRepo(db);
    const p = await repo.crear({ descripcion: "Jabón", costo: 10, pct_ganancia: 0 });
    await repo.actualizar(p.id, { descripcion: "Jabón azul", costo: 10, pct_ganancia: 100 });
    const leido = await repo.obtener(p.id);
    expect(leido?.descripcion).toBe("Jabón azul");
    expect(leido?.precio_venta).toBe(20);
  });

  it("elimina (borrado lógico) y deja de listarse", async () => {
    const repo = crearProductoRepo(db);
    const p = await repo.crear({ descripcion: "Temporal" });
    await repo.eliminar(p.id);
    expect(await repo.obtener(p.id)).toBeUndefined();
    expect(await repo.listar()).toHaveLength(0);
  });

  it("busca por descripción y por código de barra", async () => {
    const repo = crearProductoRepo(db);
    await repo.crear({ descripcion: "Aceite Crisol", codigo_barra: "7460100200300" });
    await repo.crear({ descripcion: "Harina Blanca" });

    expect(await repo.listar("aceite")).toHaveLength(1);
    expect(await repo.listar("HARINA")).toHaveLength(1); // insensible a mayúsculas
    expect(await repo.porCodigoBarra("7460100200300")).toBeDefined();
    expect(await repo.listar()).toHaveLength(2);
  });

  it("rechaza producto sin descripción", async () => {
    const repo = crearProductoRepo(db);
    await expect(repo.crear({ descripcion: "  " })).rejects.toBeInstanceOf(ValidacionError);
  });

  it("ida y vuelta: columnas del censo (precio_2, precio_3, cantidad_minima_mayoreo, existencia_minima)", async () => {
    const repo = crearProductoRepo(db);
    const p = await repo.crear({
      descripcion: "Detergente",
      precio_2: 120.5,
      precio_3: 110.25,
      cantidad_minima_mayoreo: 12,
      existencia_minima: 5,
    });
    expect(p.precio_2).toBe(120.5);
    expect(p.precio_3).toBe(110.25);
    expect(p.cantidad_minima_mayoreo).toBe(12);
    expect(p.existencia_minima).toBe(5);

    const leido = await repo.obtener(p.id);
    expect(leido?.precio_2).toBe(120.5);
    expect(leido?.precio_3).toBe(110.25);
    expect(leido?.cantidad_minima_mayoreo).toBe(12);
    expect(leido?.existencia_minima).toBe(5);

    await repo.actualizar(p.id, {
      descripcion: "Detergente",
      precio_2: 200,
      precio_3: 190,
      cantidad_minima_mayoreo: 24,
      existencia_minima: 10,
    });
    const actualizado = await repo.obtener(p.id);
    expect(actualizado?.precio_2).toBe(200);
    expect(actualizado?.precio_3).toBe(190);
    expect(actualizado?.cantidad_minima_mayoreo).toBe(24);
    expect(actualizado?.existencia_minima).toBe(10);
  });

  it("al crear sin precio_2/precio_3, los sugiere como costo+10%/costo+5%", async () => {
    const repo = crearProductoRepo(db);
    const p = await repo.crear({ descripcion: "Arroz 5lb", costo: 40, pct_ganancia: 25 });
    expect(p.precio_2).toBe(44);
    expect(p.precio_3).toBe(42);
  });

  it("precio_2/precio_3 explícitos al crear ganan sobre la sugerencia", async () => {
    const repo = crearProductoRepo(db);
    const p = await repo.crear({
      descripcion: "Arroz 5lb",
      costo: 40,
      pct_ganancia: 25,
      precio_2: 999,
      precio_3: 888,
    });
    expect(p.precio_2).toBe(999);
    expect(p.precio_3).toBe(888);
  });

  it("actualizar() nunca recalcula precio_2/precio_3: sin tope, el valor guardado manda siempre", async () => {
    const repo = crearProductoRepo(db);
    const p = await repo.crear({ descripcion: "Arroz 5lb", costo: 40, pct_ganancia: 25 });
    // Aunque el costo suba, precio_2/precio_3 no se tocan si no vienen en el input.
    await repo.actualizar(p.id, { descripcion: "Arroz 5lb", costo: 100 });
    const sinCambioExplicito = await repo.obtener(p.id);
    expect(sinCambioExplicito?.precio_2).toBe(44);
    expect(sinCambioExplicito?.precio_3).toBe(42);

    // Y un valor manual muy por encima de costo+10%/5% se guarda tal cual (sin tope).
    await repo.actualizar(p.id, { descripcion: "Arroz 5lb", precio_2: 500, precio_3: 500 });
    const conTopeSuperado = await repo.obtener(p.id);
    expect(conTopeSuperado?.precio_2).toBe(500);
    expect(conTopeSuperado?.precio_3).toBe(500);
  });
});

describe("clienteRepo — CRUD y validaciones", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  it("crea, busca y elimina", async () => {
    const repo = crearClienteRepo(db);
    await repo.crear({ nombre: "María", apellidos: "Gómez", telefono: "809-111-2222" });
    await repo.crear({ nombre: "Pedro", correo: "pedro@mail.com" });

    expect(await repo.listar()).toHaveLength(2);
    expect(await repo.listar("maria")).toHaveLength(1);
    expect(await repo.listar("809-111")).toHaveLength(1);

    const [m] = await repo.listar("maria");
    await repo.eliminar(m.id);
    expect(await repo.listar()).toHaveLength(1);
  });

  it("rechaza correo inválido", async () => {
    const repo = crearClienteRepo(db);
    await expect(repo.crear({ nombre: "X", correo: "malo@" })).rejects.toBeInstanceOf(
      ValidacionError,
    );
  });

  it("rechaza RNC inválido", async () => {
    const repo = crearClienteRepo(db);
    await expect(
      repo.crear({ nombre: "Empresa", documento_tipo: "rnc", documento_numero: "111111111" }),
    ).rejects.toBeInstanceOf(ValidacionError);
  });

  it("ida y vuelta: columnas del censo (nivel_precio, niveles_permitidos_json, fecha_nacimiento, dias_credito)", async () => {
    const repo = crearClienteRepo(db);
    const c = await repo.crear({
      nombre: "Ana",
      nivel_precio: "mayoreo",
      niveles_permitidos_json: '["normal","mayoreo"]',
      fecha_nacimiento: "1990-05-01",
      dias_credito: 30,
    });
    expect(c.nivel_precio).toBe("mayoreo");
    expect(c.niveles_permitidos_json).toBe('["normal","mayoreo"]');
    expect(c.fecha_nacimiento).toBe("1990-05-01");
    expect(c.dias_credito).toBe(30);

    const leido = await repo.obtener(c.id);
    expect(leido?.nivel_precio).toBe("mayoreo");
    expect(leido?.niveles_permitidos_json).toBe('["normal","mayoreo"]');
    expect(leido?.fecha_nacimiento).toBe("1990-05-01");
    expect(leido?.dias_credito).toBe(30);

    await repo.actualizar(c.id, { nombre: "Ana", nivel_precio: "especial", dias_credito: 45 });
    const actualizado = await repo.obtener(c.id);
    expect(actualizado?.nivel_precio).toBe("especial");
    expect(actualizado?.dias_credito).toBe(45);
  });
});

describe("negocioRepo — configuración (singleton)", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  it("guarda y luego actualiza la misma fila", async () => {
    const repo = crearNegocioRepo(db);
    expect(await repo.obtener()).toBeUndefined();

    await repo.guardar({ nombre_comercial: "Mi Colmado", ancho_impresora_default: 58 });
    let cfg = await repo.obtener();
    expect(cfg?.nombre_comercial).toBe("Mi Colmado");
    expect(cfg?.ancho_impresora_default).toBe(58);

    await repo.guardar({ nombre_comercial: "Mi Colmado", ancho_impresora_default: 80 });
    const todos = await db.all("SELECT id FROM negocio WHERE deleted_at IS NULL");
    expect(todos).toHaveLength(1); // sigue siendo una sola fila
    cfg = await repo.obtener();
    expect(cfg?.ancho_impresora_default).toBe(80);
  });

  it("rechaza ancho de impresora inválido", async () => {
    const repo = crearNegocioRepo(db);
    await expect(
      repo.guardar({ nombre_comercial: "X", ancho_impresora_default: 72 as 58 }),
    ).rejects.toBeInstanceOf(ValidacionError);
  });

  it("ida y vuelta: columnas del censo (desfase_horario_min, politica_costo, umbral_aviso_costo_pct, exige_caja_abierta, arqueo_ciego, umbral_diferencia_caja)", async () => {
    const repo = crearNegocioRepo(db);
    await repo.guardar({
      nombre_comercial: "Mi Colmado",
      desfase_horario_min: 15,
      politica_costo: "avisar",
      umbral_aviso_costo_pct: 10,
      exige_caja_abierta: true,
      arqueo_ciego: true,
      umbral_diferencia_caja: 50,
    });
    let cfg = await repo.obtener();
    expect(cfg?.desfase_horario_min).toBe(15);
    expect(cfg?.politica_costo).toBe("avisar");
    expect(cfg?.umbral_aviso_costo_pct).toBe(10);
    expect(cfg?.exige_caja_abierta).toBe(1);
    expect(cfg?.arqueo_ciego).toBe(1);
    expect(cfg?.umbral_diferencia_caja).toBe(50);

    await repo.guardar({
      nombre_comercial: "Mi Colmado",
      exige_caja_abierta: false,
      arqueo_ciego: false,
      umbral_diferencia_caja: 0,
    });
    cfg = await repo.obtener();
    expect(cfg?.exige_caja_abierta).toBe(0);
    expect(cfg?.arqueo_ciego).toBe(0);
    expect(cfg?.umbral_diferencia_caja).toBe(0);
  });

  it("una fila nueva de negocio arranca con exige_caja_abierta en 0 (decisión 6: instalaciones apagadas por defecto)", async () => {
    const repo = crearNegocioRepo(db);
    const n = await repo.guardar({ nombre_comercial: "Recién instalado" });
    expect(n.exige_caja_abierta).toBe(0);
  });
});

describe("departamentoRepo", () => {
  it("crea, lista, renombra y elimina", async () => {
    const db = await nuevaDb();
    const repo = crearDepartamentoRepo(db);
    const d = await repo.crear("Bebidas");
    expect(await repo.listar()).toHaveLength(1);
    await repo.renombrar(d.id, "Bebidas frías");
    expect((await repo.listar())[0].nombre).toBe("Bebidas frías");
    await repo.eliminar(d.id);
    expect(await repo.listar()).toHaveLength(0);
  });
});
