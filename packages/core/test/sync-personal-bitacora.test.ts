import { describe, it, expect } from "vitest";
import { nuevaDb, nuevaDbHasta } from "./_ayuda.js";
import { migrate } from "../src/db/migrator.js";
import { crearUsuarioRepo } from "../src/index.js";
import {
  crearSincronizadorBidireccional,
  crearSincronizadorEntrante,
  OPCIONES_MODO_REMOTO,
} from "../src/sync/index.js";
import { CONFIG, crearNubeFalsa } from "./_nube-falsa.js";

describe("personal — subida a la nube", () => {
  it("sube el usuario solo con nombre, rol y estado, sin PIN ni permisos", async () => {
    const db = await nuevaDb();
    const nube = crearNubeFalsa();
    await crearUsuarioRepo(db).crear({ nombre: "Ana", rol: "cajero", pin: "1234" });

    await crearSincronizadorBidireccional(db, CONFIG, nube.fetch).sincronizar();

    const filas = nube.subidas.filter((u) => u.tabla === "usuario").flatMap((u) => u.filas);
    expect(filas).toHaveLength(1);
    expect(Object.keys(filas[0]).sort()).toEqual([
      "activo",
      "created_at",
      "deleted_at",
      "id",
      "nombre",
      "rol",
      "updated_at",
    ]);
  });

  it("sube la bitácora de acciones después de los usuarios", async () => {
    const db = await nuevaDb();
    const nube = crearNubeFalsa();
    await crearUsuarioRepo(db).crear({ nombre: "Ana", rol: "cajero", pin: "1234" });

    await crearSincronizadorBidireccional(db, CONFIG, nube.fetch).sincronizar();

    const tablas = nube.subidas.map((u) => u.tabla);
    const bitacora = nube.subidas
      .filter((u) => u.tabla === "bitacora_accion")
      .flatMap((u) => u.filas);
    expect(bitacora.length).toBeGreaterThan(0);
    expect(bitacora[0]).toHaveProperty("accion");
    expect(tablas.indexOf("usuario")).toBeLessThan(tablas.indexOf("bitacora_accion"));
  });
});

describe("personal — bajada desde la nube", () => {
  it("un usuario creado en el panel aparece en la caja sin PIN y no puede entrar", async () => {
    const db = await nuevaDb();
    const nube = crearNubeFalsa();
    const ts = "2026-09-25T09:00:00+00:00";
    nube.tablas.usuario = [
      {
        id: "u-remoto",
        nombre: "Luis",
        rol: "cajero",
        activo: true,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      },
    ];

    await crearSincronizadorEntrante(db, CONFIG, nube.fetch).sincronizar();

    const usuarios = crearUsuarioRepo(db);
    expect((await usuarios.obtener("u-remoto"))?.nombre).toBe("Luis");
    expect(await usuarios.autenticar({ usuarioId: "u-remoto", pin: "1234" })).toMatchObject({
      ok: false,
      motivo: "sin_pin",
    });
    const consulta = nube.consultas.find((u) => u.pathname === "/rest/v1/usuario");
    expect(consulta?.searchParams.get("select")).toBe(
      "id,nombre,rol,activo,created_at,updated_at,deleted_at",
    );
  });
});

describe("bitácora — bajada a la copia remota", () => {
  it("baja las acciones aunque la tabla no tenga updated_at y avanza por timestamp", async () => {
    const db = await nuevaDb();
    await db.exec("PRAGMA foreign_keys = OFF");
    const nube = crearNubeFalsa();
    const marca = "2026-09-25T10:00:00+00:00";
    nube.tablas.bitacora_accion = [
      {
        id: "b1",
        usuario_id: "u-cajero",
        origen: "app",
        accion: "cobrar",
        entidad: "factura",
        entidad_id: "f1",
        resumen: "Total RD$ 118.00",
        confirmada: true,
        timestamp: marca,
      },
    ];
    const sincronizador = crearSincronizadorEntrante(db, CONFIG, nube.fetch, OPCIONES_MODO_REMOTO);

    await sincronizador.sincronizar();
    nube.consultas.length = 0;
    await sincronizador.sincronizar();

    const fila = await db.get<{ accion: string; resumen: string }>(
      "SELECT accion, resumen FROM bitacora_accion WHERE id=?",
      ["b1"],
    );
    expect(fila).toEqual({ accion: "cobrar", resumen: "Total RD$ 118.00" });
    const consulta = nube.consultas.find((u) => u.pathname === "/rest/v1/bitacora_accion");
    expect(consulta?.searchParams.get("timestamp")).toBe(`gte.${marca}`);
  });
});

describe("migración 97 — usuario y bitácora entran a la cola de subida", () => {
  it("marca como pendientes los usuarios y acciones que ya existían", async () => {
    const db = await nuevaDbHasta(96);
    await db.run(
      "INSERT INTO usuario (id, nombre, rol, activo, created_at, updated_at) VALUES (?,?,?,?,?,?)",
      ["u1", "Ana", "cajero", 1, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"],
    );
    await db.run("INSERT INTO bitacora_accion (id, accion, entidad, timestamp) VALUES (?,?,?,?)", [
      "b1",
      "crear_usuario",
      "usuario",
      "2026-01-01T00:00:00.000Z",
    ]);

    await migrate(db);

    const pendientes = await db.all<{ tabla: string; id: string }>(
      "SELECT tabla, id FROM sync_pendiente WHERE tabla IN ('usuario','bitacora_accion') ORDER BY tabla",
    );
    expect(pendientes).toEqual([
      { tabla: "bitacora_accion", id: "b1" },
      { tabla: "usuario", id: "u1" },
    ]);
  });
});
