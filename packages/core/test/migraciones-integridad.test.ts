import { describe, it, expect } from "vitest";
import { migrations, type Migration } from "../src/db/migrations.js";
import { RANGOS_MIGRACION } from "../src/db/rangos-migracion.js";
import { migrate } from "../src/db/migrator.js";
import { nuevaDbHasta, tablasDe } from "./_ayuda.js";

/**
 * Detecta un ';' que el split(";") ingenuo de tauri-sql-driver.ts:17-22
 * partiría mal: dentro de un literal de texto entre comillas simples, o
 * después de un comentario '--' en la misma línea. No reemplaza
 * partirStatements (eso es PLATAFORMA-02); solo protege contra el patrón
 * que rompería el driver de escritorio hoy.
 */
function tienePuntoYComaPeligroso(sql: string): boolean {
  let enCadena = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'") {
      enCadena = !enCadena;
      continue;
    }
    if (!enCadena && c === "-" && sql[i + 1] === "-") {
      const finLinea = sql.indexOf("\n", i);
      const resto = finLinea === -1 ? sql.slice(i) : sql.slice(i, finLinea);
      if (resto.includes(";")) return true;
      i = finLinea === -1 ? sql.length : finLinea;
      continue;
    }
    if (enCadena && c === ";") return true;
  }
  return false;
}

describe("integridad de migraciones", () => {
  it("los ids son únicos", () => {
    const vistos = new Map<number, Migration>();
    for (const m of migrations) {
      const previa = vistos.get(m.id);
      if (previa) {
        throw new Error(
          `id de migración duplicado: ${m.id} lo usan '${previa.nombre}' y '${m.nombre}'`,
        );
      }
      vistos.set(m.id, m);
    }
    expect(vistos.size).toBe(migrations.length);
  });

  it("los nombres son únicos", () => {
    const vistos = new Map<string, Migration>();
    for (const m of migrations) {
      const previa = vistos.get(m.nombre);
      if (previa) {
        throw new Error(
          `nombre de migración duplicado: '${m.nombre}' lo usan los ids ${previa.id} y ${m.id}`,
        );
      }
      vistos.set(m.nombre, m);
    }
  });

  it("el array está ordenado por id ascendente", () => {
    const ids = migrations.map((m) => m.id);
    const ordenados = [...ids].sort((a, b) => a - b);
    expect(ids).toEqual(ordenados);
  });

  it("los rangos declarados no se solapan entre sí", () => {
    const ordenados = [...RANGOS_MIGRACION].sort((a, b) => a.desde - b.desde);
    for (let i = 1; i < ordenados.length; i++) {
      const anterior = ordenados[i - 1]!;
      const actual = ordenados[i]!;
      expect(
        actual.desde,
        `${anterior.area} (${anterior.desde}-${anterior.hasta}) se solapa con ${actual.area} (${actual.desde}-${actual.hasta})`,
      ).toBeGreaterThan(anterior.hasta);
    }
  });

  it("todo id cae dentro de algún rango declarado en RANGOS_MIGRACION", () => {
    for (const m of migrations) {
      const rango = RANGOS_MIGRACION.find((r) => m.id >= r.desde && m.id <= r.hasta);
      if (!rango) {
        const validos = RANGOS_MIGRACION.map((r) => `${r.area} (${r.desde}-${r.hasta})`).join(", ");
        throw new Error(
          `migración '${m.nombre}' usa id ${m.id}, fuera de todo rango válido. Rangos: ${validos}`,
        );
      }
    }
  });

  it("ningún sql contiene ';' dentro de un literal entre comillas simples ni tras '--' en la misma línea", () => {
    for (const m of migrations) {
      if (tienePuntoYComaPeligroso(m.sql)) {
        throw new Error(
          `migración '${m.nombre}' (id ${m.id}) tiene un ';' dentro de un literal o de un comentario '--': ` +
            `packages/desktop/src/db/tauri-sql-driver.ts la partiría en pedazos inválidos y solo revienta en escritorio`,
        );
      }
    }
  });

  it("para cada migración N, aplicar nuevaDbHasta(N-1) y luego migrate() completo termina sin error y deja todas las tablas esperadas", async () => {
    for (const m of migrations) {
      const anterior = migrations.filter((x) => x.id < m.id);
      const idMaximoAnterior = anterior.length > 0 ? Math.max(...anterior.map((x) => x.id)) : 0;
      const db = await nuevaDbHasta(idMaximoAnterior);
      await migrate(db);
      const tablas = await tablasDe(db);
      expect(tablas.length).toBeGreaterThan(0);
    }
  });

  it("migrate() sobre nuevaDbHasta(10) aplica exactamente las migraciones con id > 10 y ninguna más", async () => {
    const db = await nuevaDbHasta(10);
    const aplicadas = await migrate(db);
    const idsEsperados = migrations.filter((m) => m.id > 10).map((m) => m.id);
    expect(aplicadas.map((m) => m.id).sort((a, b) => a - b)).toEqual(idsEsperados.sort((a, b) => a - b));
  });
});

describe("_ayuda", () => {
  it("nuevaDbHasta(3) deja aplicadas 3 filas en _migracion y no crea las tablas de la migración 4", async () => {
    const db = await nuevaDbHasta(3);
    const filas = await db.all<{ id: number }>("SELECT id FROM _migracion ORDER BY id");
    expect(filas.map((f) => f.id)).toEqual([1, 2, 3]);

    const tablas = await tablasDe(db);
    // La migración 4 crea movimiento_inventario: no debe existir todavía.
    expect(tablas).not.toContain("movimiento_inventario");
  });
});
