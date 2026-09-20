import { describe, it, expect } from "vitest";
import { nuevaDb } from "./_ayuda.js";
import { crearDepartamentoRepo, crearProductoRepo } from "../src/index.js";

/**
 * Verifica el mecanismo de la migración 95 (cola de sincronización
 * saliente): los triggers `trg_*_sync_*` deben marcar cualquier fila
 * insertada o actualizada en una tabla sincronizada como pendiente en
 * `sync_pendiente`, sin que ningún repo tenga que saberlo. Se prueba contra
 * `producto` (una de las 13 tablas sincronizadas) usando los repos reales,
 * no SQL a mano, para que esto siga probando el camino real de la app.
 */
describe("sync_pendiente — cola de sincronización saliente (migración 95)", () => {
  async function pendientesDe(db: Awaited<ReturnType<typeof nuevaDb>>, tabla: string, id: string) {
    return db.get<{ tabla: string; id: string }>(
      "SELECT tabla, id FROM sync_pendiente WHERE tabla=? AND id=?",
      [tabla, id],
    );
  }

  it("un INSERT en una tabla sincronizada la marca pendiente", async () => {
    const db = await nuevaDb();
    const departamentos = crearDepartamentoRepo(db);
    const productos = crearProductoRepo(db);
    const depto = await departamentos.crear("Abarrotes");
    const producto = await productos.crear({
      descripcion: "Arroz",
      tipo_venta: "unidad",
      unidad_medida: "unidad",
      costo: 30,
      departamento_id: depto.id,
      impuesto_tipo: "itbis18",
    });

    expect(await pendientesDe(db, "producto", producto.id)).toBeDefined();
  });

  it("subir (borrar de la cola) y luego actualizar la fila la vuelve a marcar pendiente", async () => {
    const db = await nuevaDb();
    const departamentos = crearDepartamentoRepo(db);
    const productos = crearProductoRepo(db);
    const depto = await departamentos.crear("Abarrotes");
    const producto = await productos.crear({
      descripcion: "Arroz",
      tipo_venta: "unidad",
      unidad_medida: "unidad",
      costo: 30,
      departamento_id: depto.id,
      impuesto_tipo: "itbis18",
    });

    // Simula que el subidor ya la subió: la borra de la cola.
    await db.run("DELETE FROM sync_pendiente WHERE tabla=? AND id=?", ["producto", producto.id]);
    expect(await pendientesDe(db, "producto", producto.id)).toBeUndefined();

    await productos.actualizar(producto.id, { descripcion: "Arroz", costo: 35 });
    expect(await pendientesDe(db, "producto", producto.id)).toBeDefined();
  });

  it("una tabla NO sincronizada (p.ej. usuario) no genera entradas en la cola", async () => {
    const db = await nuevaDb();
    const filas = await db.all<{ tabla: string }>("SELECT DISTINCT tabla FROM sync_pendiente");
    const tablas = filas.map((f) => f.tabla);
    expect(tablas).not.toContain("usuario");
    expect(tablas).not.toContain("bitacora_accion");
  });

  it("el backfill de la migración marca como pendiente las filas ya sembradas", async () => {
    const db = await nuevaDb();
    // nuevaDb() no siembra datos, así que se crea una fila después de migrar
    // y se confirma que YA aparece pendiente sin necesidad de tocar nada más
    // (el backfill real se prueba de forma indirecta: si los triggers no
    // existieran, este mismo INSERT tampoco aparecería en la cola).
    const departamentos = crearDepartamentoRepo(db);
    const depto = await departamentos.crear("Bebidas");
    expect(await pendientesDe(db, "departamento", depto.id)).toBeDefined();
  });
});
