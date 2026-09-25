import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SqlDriver } from "../src/db/driver.js";
import { nuevaDb, nuevaDbHasta } from "./_ayuda.js";
import { migrate } from "../src/db/migrator.js";
import { crearProductoRepo } from "../src/index.js";
import { crearSincronizadorEntrante } from "../src/sync/bajada-entrante.js";
import { crearSincronizadorBidireccional } from "../src/sync/index.js";

type FilaRemota = Record<string, unknown>;

const MAX_FILAS_NUBE = 1000;

interface NubeFalsa {
  tablas: Record<string, FilaRemota[]>;
  consultas: URL[];
  subidas: { tabla: string; filas: FilaRemota[] }[];
  autenticaciones: { total: number };
  tablasConError: Set<string>;
  fetch: typeof fetch;
}

function crearNubeFalsa(): NubeFalsa {
  const tablas: Record<string, FilaRemota[]> = {};
  const consultas: URL[] = [];
  const subidas: { tabla: string; filas: FilaRemota[] }[] = [];
  const tablasConError = new Set<string>();
  const autenticaciones = { total: 0 };
  const fetchFalso = (async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(entrada));
    if (url.pathname === "/auth/v1/token") {
      autenticaciones.total += 1;
      return new Response(JSON.stringify({ access_token: "token-de-prueba" }), { status: 200 });
    }
    const tabla = url.pathname.replace("/rest/v1/", "");
    if (init?.method === "POST") {
      subidas.push({ tabla, filas: JSON.parse(String(init.body)) as FilaRemota[] });
      return new Response(null, { status: 201 });
    }
    consultas.push(url);
    if (tablasConError.has(tabla)) return new Response("boom", { status: 500 });
    const filtro = url.searchParams.get("updated_at");
    const desde = filtro?.startsWith("gte.") ? new Date(filtro.slice(4)).getTime() : -Infinity;
    const filas = (tablas[tabla] ?? [])
      .filter((f) => new Date(String(f.updated_at)).getTime() >= desde)
      .sort(
        (a, b) =>
          String(a.updated_at).localeCompare(String(b.updated_at)) ||
          String(a.id).localeCompare(String(b.id)),
      );
    const limite = Number(url.searchParams.get("limit") ?? Infinity);
    const desplazamiento = Number(url.searchParams.get("offset") ?? 0);
    const pagina = filas.slice(desplazamiento, desplazamiento + Math.min(limite, MAX_FILAS_NUBE));
    return new Response(JSON.stringify(pagina), { status: 200 });
  }) as typeof fetch;
  return { tablas, consultas, subidas, autenticaciones, tablasConError, fetch: fetchFalso };
}

const CONFIG = {
  supabaseUrl: "https://ejemplo.supabase.co",
  supabaseAnonKey: "anon",
  syncEmail: "sync@ejemplo.com",
  syncPassword: "clave",
};

function productoRemoto(sobrescribir: FilaRemota = {}): FilaRemota {
  return {
    id: "prod-remoto-1",
    codigo_barra: null,
    descripcion: "Arroz a granel",
    tipo_venta: "granel",
    unidad_medida: "lb",
    costo: 30,
    pct_ganancia: 20,
    precio_venta: 45,
    precio_mayoreo: 42,
    precio_2: 40,
    precio_3: 38,
    cantidad_minima_mayoreo: 10,
    departamento_id: null,
    impuesto_tipo: "exento",
    tasa_impuesto: 0,
    existencia: null,
    politica_sin_existencia: "advertir",
    activo: true,
    favorito: false,
    created_at: "2026-09-24T10:00:00+00:00",
    updated_at: "2026-09-24T10:00:00+00:00",
    deleted_at: null,
    ...sobrescribir,
  };
}

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
