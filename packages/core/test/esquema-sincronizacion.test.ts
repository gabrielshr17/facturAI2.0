import { describe, expect, it } from "vitest";
import { esquemaSincronizacion, TABLAS_SINCRONIZADAS } from "../src/sync/esquema-sincronizacion.js";

/**
 * PowerSync arma su propia base local a partir de este esquema (ver
 * packages/desktop/src/sync/iniciar-sync.ts). Estas pruebas no ejercitan
 * sincronización real (eso requiere un build de Tauri contra la instancia
 * real de PowerSync, fuera de alcance aquí) — solo verifican que el esquema
 * declarado sea consistente y quede alineado con la lista de tablas
 * documentada en rls-policies.sql.
 */
describe("esquemaSincronizacion", () => {
  it("declara exactamente una tabla de PowerSync por cada tabla listada en TABLAS_SINCRONIZADAS", () => {
    const nombresEsquema = esquemaSincronizacion.tables.map((tabla) => tabla.name).sort();
    const nombresEsperados = [...TABLAS_SINCRONIZADAS].sort();

    expect(nombresEsquema).toEqual(nombresEsperados);
  });

  it("no repite nombres de tabla", () => {
    const nombres = esquemaSincronizacion.tables.map((tabla) => tabla.name);
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  it("excluye explícitamente las tablas que no deben salir del registro", () => {
    const excluidas = [
      "usuario",
      "usuario_seguridad",
      "bitacora_accion",
      "secuencia_ncf",
      "comprobante_fiscal",
      "instalacion",
      "caja",
    ];
    const nombresEsquema = new Set(esquemaSincronizacion.tables.map((tabla) => tabla.name));

    for (const tabla of excluidas) {
      expect(nombresEsquema.has(tabla)).toBe(false);
    }
  });

  it("cada tabla declara created_at, updated_at y deleted_at como columnas de texto", () => {
    for (const tabla of esquemaSincronizacion.tables) {
      const nombresColumnas = tabla.columns.map((columna) => columna.name);
      expect(nombresColumnas).toEqual(expect.arrayContaining(["created_at", "updated_at", "deleted_at"]));
    }
  });

  it("factura_linea referencia factura_id y producto_id como columnas de texto", () => {
    const facturaLinea = esquemaSincronizacion.tables.find((tabla) => tabla.name === "factura_linea");
    expect(facturaLinea).toBeDefined();

    const columnas = new Map(facturaLinea!.columns.map((columna) => [columna.name, columna.type]));
    expect(columnas.get("factura_id")).toBe("TEXT");
    expect(columnas.get("producto_id")).toBe("TEXT");
    expect(columnas.get("cantidad")).toBe("REAL");
  });
});
