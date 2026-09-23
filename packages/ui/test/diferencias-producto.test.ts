import { describe, it, expect } from "vitest";
import type { Producto, ProductoInput } from "@sfr/core";
import { diferenciasProducto } from "../src/componentes/FormularioProducto.js";

const original = {
  descripcion: "Arroz",
  codigo_barra: null,
  tipo_venta: "unidad",
  unidad_medida: null,
  costo: 40,
  pct_ganancia: 25,
  precio_venta: 50,
  precio_mayoreo: null,
  precio_2: null,
  precio_3: null,
  impuesto_tipo: "itbis18",
  politica_sin_existencia: "advertir",
} as Producto;

const formIgual: ProductoInput = {
  descripcion: "Arroz",
  codigo_barra: null,
  tipo_venta: "unidad",
  unidad_medida: null,
  costo: 40,
  pct_ganancia: 25,
  precio_venta: 50,
  precio_mayoreo: null,
  precio_2: null,
  precio_3: null,
  impuesto_tipo: "itbis18",
  politica_sin_existencia: "advertir",
};

describe("diferenciasProducto — niveles de precio", () => {
  it("un producto sin precio_2/precio_3 abierto y sin tocar no muestra cambios", () => {
    expect(diferenciasProducto(original, formIgual)).toEqual([]);
  });

  it("reporta el cambio de precio nivel 2", () => {
    const cambios = diferenciasProducto(original, { ...formIgual, precio_2: 45 });
    expect(cambios.map((c) => c.campo)).toEqual(["Precio nivel 2"]);
  });
});
