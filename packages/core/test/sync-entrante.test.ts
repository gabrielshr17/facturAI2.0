import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SqlDriver } from "../src/db/driver.js";
import { nuevaDb, nuevaDbHasta } from "./_ayuda.js";
import { migrate } from "../src/db/migrator.js";
import { crearProductoRepo } from "../src/index.js";
import { crearSincronizadorEntrante, OPCIONES_MODO_REMOTO } from "../src/sync/bajada-entrante.js";
import { crearSincronizadorBidireccional } from "../src/sync/index.js";

import { CONFIG, crearNubeFalsa, productoRemoto, type NubeFalsa } from "./_nube-falsa.js";

describe("sincronizador entrante — Supabase hacia la base local", () => {
  let db: SqlDriver;
  let nube: NubeFalsa;

  beforeEach(async () => {
    db = await nuevaDb();
    nube = crearNubeFalsa();
  });

  it("crea localmente un producto editado en el panel remoto que la caja no tenía", async () => {
    nube.tablas.producto = [productoRemoto()];

    await crearSincronizadorEntrante(db, CONFIG, nube.fetch).sincronizar();

    const local = await crearProductoRepo(db).obtener("prod-remoto-1");
    expect(local?.descripcion).toBe("Arroz a granel");
    expect(local?.tipo_venta).toBe("granel");
    expect(local?.precio_2).toBe(40);
    expect(local?.precio_3).toBe(38);
    expect(local?.activo).toBe(1);
  });

  it("aplica una edición remota más nueva sobre la fila local y no la devuelve a la cola de subida", async () => {
    const productos = crearProductoRepo(db);
    const local = await productos.crear({ descripcion: "Arroz", costo: 30, precio_venta: 45 });
    const futuro = new Date(Date.now() + 60_000).toISOString();
    nube.tablas.producto = [
      productoRemoto({
        id: local.id,
        descripcion: "Arroz premium",
        precio_2: 41,
        updated_at: futuro,
      }),
    ];

    await crearSincronizadorEntrante(db, CONFIG, nube.fetch).sincronizar();

    const actualizado = await productos.obtener(local.id);
    expect(actualizado?.descripcion).toBe("Arroz premium");
    expect(actualizado?.precio_2).toBe(41);
    const pendiente = await db.get("SELECT id FROM sync_pendiente WHERE tabla=? AND id=?", [
      "producto",
      local.id,
    ]);
    expect(pendiente).toBeUndefined();
  });

  it("ignora una fila remota más vieja y deja el cambio local pendiente de subir", async () => {
    const productos = crearProductoRepo(db);
    const local = await productos.crear({ descripcion: "Arroz", costo: 30, precio_venta: 45 });
    nube.tablas.producto = [
      productoRemoto({
        id: local.id,
        descripcion: "Arroz viejo",
        updated_at: "2020-01-01T00:00:00+00:00",
      }),
    ];

    await crearSincronizadorEntrante(db, CONFIG, nube.fetch).sincronizar();

    expect((await productos.obtener(local.id))?.descripcion).toBe("Arroz");
    const pendiente = await db.get("SELECT id FROM sync_pendiente WHERE tabla=? AND id=?", [
      "producto",
      local.id,
    ]);
    expect(pendiente).toBeDefined();
  });

  it("en la segunda sincronización solo pide filas cambiadas desde la última recibida", async () => {
    nube.tablas.producto = [productoRemoto({ updated_at: "2026-09-24T10:00:00+00:00" })];
    const sincronizador = crearSincronizadorEntrante(db, CONFIG, nube.fetch);

    await sincronizador.sincronizar();
    nube.consultas.length = 0;
    await sincronizador.sincronizar();

    const consultaProducto = nube.consultas.find((u) => u.pathname === "/rest/v1/producto");
    expect(consultaProducto?.searchParams.get("updated_at")).toBe("gte.2026-09-24T10:00:00+00:00");
  });

  it("una tabla que falla no impide sincronizar las demás ni lanza el error", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    nube.tablasConError.add("cliente");
    nube.tablas.producto = [productoRemoto()];

    await expect(
      crearSincronizadorEntrante(db, CONFIG, nube.fetch).sincronizar(),
    ).resolves.toBeUndefined();

    expect((await crearProductoRepo(db).obtener("prod-remoto-1"))?.descripcion).toBe(
      "Arroz a granel",
    );
    expect(registro).toHaveBeenCalled();
    registro.mockRestore();
  });

  it("trae todas las filas aunque la nube limite cada respuesta a 1000", async () => {
    const base = Date.parse("2026-09-01T00:00:00.000Z");
    nube.tablas.producto = Array.from({ length: 2300 }, (_, i) =>
      productoRemoto({
        id: `prod-${i}`,
        descripcion: `Producto ${i}`,
        updated_at: new Date(base + i * 1000).toISOString(),
      }),
    );

    await crearSincronizadorEntrante(db, CONFIG, nube.fetch).sincronizar();

    const total = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM producto");
    expect(total?.n).toBe(2300);
  });

  it("trae todas las filas cuando más de una página comparte el mismo updated_at", async () => {
    nube.tablas.producto = Array.from({ length: 1300 }, (_, i) =>
      productoRemoto({
        id: `lote-${String(i).padStart(4, "0")}`,
        descripcion: `Importado ${i}`,
        updated_at: "2026-09-10T12:00:00.000Z",
      }),
    );

    await crearSincronizadorEntrante(db, CONFIG, nube.fetch).sincronizar();

    const total = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM producto");
    expect(total?.n).toBe(1300);
  });

  it("propaga un borrado lógico hecho en el panel remoto", async () => {
    const productos = crearProductoRepo(db);
    const local = await productos.crear({ descripcion: "Arroz", costo: 30, precio_venta: 45 });
    const futuro = new Date(Date.now() + 60_000).toISOString();
    nube.tablas.producto = [
      productoRemoto({ id: local.id, updated_at: futuro, deleted_at: futuro }),
    ];

    await crearSincronizadorEntrante(db, CONFIG, nube.fetch).sincronizar();

    expect(await productos.obtener(local.id)).toBeUndefined();
  });

  it("no crea localmente una fila que la nube ya trae borrada", async () => {
    nube.tablas.producto = [
      productoRemoto({ id: "basura-1", deleted_at: "2026-09-24T11:00:00+00:00" }),
    ];

    await crearSincronizadorEntrante(db, CONFIG, nube.fetch).sincronizar();

    const fila = await db.get("SELECT id FROM producto WHERE id=?", ["basura-1"]);
    expect(fila).toBeUndefined();
  });

  it("guarda como texto JSON una columna JSONB que la nube devuelve como arreglo", async () => {
    nube.tablas.cliente = [
      {
        id: "cli-remoto-1",
        nombre: "Colmado Don Pepe",
        niveles_permitidos_json: ["precio_2", "precio_3"],
        created_at: "2026-09-24T10:00:00+00:00",
        updated_at: "2026-09-24T10:00:00+00:00",
        deleted_at: null,
      },
    ];

    await crearSincronizadorEntrante(db, CONFIG, nube.fetch).sincronizar();

    const fila = await db.get<{ niveles_permitidos_json: string }>(
      "SELECT niveles_permitidos_json FROM cliente WHERE id=?",
      ["cli-remoto-1"],
    );
    expect(JSON.parse(fila?.niveles_permitidos_json ?? "null")).toEqual(["precio_2", "precio_3"]);
  });

  it("usa el token que entrega el proveedor de sesión sin pedir credenciales compartidas", async () => {
    nube.tablas.producto = [productoRemoto()];
    const config = {
      supabaseUrl: CONFIG.supabaseUrl,
      supabaseAnonKey: CONFIG.supabaseAnonKey,
      proveedorToken: async () => "jwt-del-dueno",
    };

    await crearSincronizadorEntrante(db, config, nube.fetch).sincronizar();

    expect(nube.autenticaciones.total).toBe(0);
    expect(nube.autorizaciones.length).toBeGreaterThan(0);
    expect(new Set(nube.autorizaciones)).toEqual(new Set(["Bearer jwt-del-dueno"]));
    expect((await crearProductoRepo(db).obtener("prod-remoto-1"))?.descripcion).toBe(
      "Arroz a granel",
    );
  });
});

describe("migración 96 — cursor de sincronización entrante", () => {
  it("se aplica sobre una base v95 con datos sin perderlos", async () => {
    const db = await nuevaDbHasta(95);
    await db.run("INSERT INTO departamento (id, nombre, created_at, updated_at) VALUES (?,?,?,?)", [
      "d1",
      "Abarrotes",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    ]);

    await migrate(db);

    await db.run("INSERT INTO sync_cursor (tabla, ultimo_updated_at) VALUES (?, ?)", [
      "producto",
      "2026-09-24T10:00:00+00:00",
    ]);
    const cursor = await db.get<{ ultimo_updated_at: string }>(
      "SELECT ultimo_updated_at FROM sync_cursor WHERE tabla=?",
      ["producto"],
    );
    const depto = await db.get<{ nombre: string }>("SELECT nombre FROM departamento WHERE id=?", [
      "d1",
    ]);
    expect(cursor?.ultimo_updated_at).toBe("2026-09-24T10:00:00+00:00");
    expect(depto?.nombre).toBe("Abarrotes");
  });
});

describe("ciclo completo — primero baja, después sube", () => {
  it("una edición remota más nueva no es pisada por la fila vieja de la caja", async () => {
    const db = await nuevaDb();
    const nube = crearNubeFalsa();
    const productos = crearProductoRepo(db);
    const local = await productos.crear({ descripcion: "Arroz", costo: 30, precio_venta: 45 });
    const futuro = new Date(Date.now() + 60_000).toISOString();
    nube.tablas.producto = [
      productoRemoto({ id: local.id, descripcion: "Arroz editado en remoto", updated_at: futuro }),
    ];

    await crearSincronizadorBidireccional(db, CONFIG, nube.fetch).sincronizar();

    const productosSubidos = nube.subidas
      .filter((u) => u.tabla === "producto")
      .flatMap((u) => u.filas)
      .filter((f) => f.id === local.id);
    expect(productosSubidos).toEqual([]);
    expect((await productos.obtener(local.id))?.descripcion).toBe("Arroz editado en remoto");
  });

  it("un segundo sincronizar() mientras el anterior sigue en curso no lanza otro ciclo", async () => {
    const db2 = await nuevaDb();
    const nube2 = crearNubeFalsa();
    const sincronizador = crearSincronizadorBidireccional(db2, CONFIG, nube2.fetch);

    await Promise.all([sincronizador.sincronizar(), sincronizador.sincronizar()]);

    expect(nube2.autenticaciones.total).toBe(1);
  });
});

describe("copia remota — modo espejo con todas las tablas", () => {
  it("trae facturas que apuntan a cajas y usuarios que el dueño no puede leer", async () => {
    const db = await nuevaDb();
    await db.exec("PRAGMA foreign_keys = OFF");
    const nube = crearNubeFalsa();
    nube.tablas.factura = [
      {
        id: "fact-1",
        fecha_hora: "2026-09-24T15:00:00+00:00",
        caja_id: "caja-de-la-tienda",
        usuario_id: "cajero-1",
        total: 118,
        estado: "cobrada",
        created_at: "2026-09-24T15:00:00+00:00",
        updated_at: "2026-09-24T15:00:00+00:00",
        deleted_at: null,
      },
    ];
    nube.tablas.factura_linea = [
      {
        id: "lin-1",
        factura_id: "fact-1",
        descripcion: "Arroz",
        cantidad: 2,
        precio_unitario: 50,
        created_at: "2026-09-24T15:00:00+00:00",
        updated_at: "2026-09-24T15:00:00+00:00",
        deleted_at: null,
      },
    ];

    await crearSincronizadorEntrante(db, CONFIG, nube.fetch, OPCIONES_MODO_REMOTO).sincronizar();

    const factura = await db.get<{ total: number }>("SELECT total FROM factura WHERE id=?", [
      "fact-1",
    ]);
    const linea = await db.get<{ cantidad: number }>(
      "SELECT cantidad FROM factura_linea WHERE id=?",
      ["lin-1"],
    );
    expect(factura?.total).toBe(118);
    expect(linea?.cantidad).toBe(2);
  });

  it("pide a usuario solo las columnas permitidas y conserva el PIN local", async () => {
    const db = await nuevaDb();
    await db.exec("PRAGMA foreign_keys = OFF");
    const nube = crearNubeFalsa();
    await db.run(
      "INSERT INTO usuario (id, nombre, rol, pin_hash, activo, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
      [
        "u1",
        "Ana",
        "cajero",
        "hash-secreto",
        1,
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:00.000Z",
      ],
    );
    nube.tablas.usuario = [
      {
        id: "u1",
        nombre: "Ana María",
        rol: "cajero",
        activo: true,
        created_at: "2026-01-01T00:00:00+00:00",
        updated_at: "2026-09-24T09:00:00+00:00",
        deleted_at: null,
      },
    ];

    await crearSincronizadorEntrante(db, CONFIG, nube.fetch, OPCIONES_MODO_REMOTO).sincronizar();

    const consulta = nube.consultas.find((u) => u.pathname === "/rest/v1/usuario");
    expect(consulta?.searchParams.get("select")).toBe(
      "id,nombre,rol,activo,created_at,updated_at,deleted_at",
    );
    const usuario = await db.get<{ nombre: string; pin_hash: string }>(
      "SELECT nombre, pin_hash FROM usuario WHERE id=?",
      ["u1"],
    );
    expect(usuario?.nombre).toBe("Ana María");
    expect(usuario?.pin_hash).toBe("hash-secreto");
  });
});

describe("ciclo completo en modo espejo", () => {
  it("pasa las opciones de la bajada y no sube lo que acaba de bajar", async () => {
    const db = await nuevaDb();
    await db.exec("PRAGMA foreign_keys = OFF");
    const nube = crearNubeFalsa();
    nube.tablas.factura = [
      {
        id: "fact-espejo",
        fecha_hora: "2026-09-24T15:00:00+00:00",
        total: 236,
        estado: "cobrada",
        created_at: "2026-09-24T15:00:00+00:00",
        updated_at: "2026-09-24T15:00:00+00:00",
        deleted_at: null,
      },
    ];

    await crearSincronizadorBidireccional(
      db,
      CONFIG,
      nube.fetch,
      OPCIONES_MODO_REMOTO,
    ).sincronizar();

    const factura = await db.get<{ total: number }>("SELECT total FROM factura WHERE id=?", [
      "fact-espejo",
    ]);
    expect(factura?.total).toBe(236);
    expect(nube.subidas.flatMap((u) => u.filas).some((f) => f.id === "fact-espejo")).toBe(false);
  });
});
