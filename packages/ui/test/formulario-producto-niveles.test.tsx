import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProductoInput } from "@sfr/core";
import { FormularioProducto } from "../src/componentes/FormularioProducto.js";

function formularioCon(form: ProductoInput) {
  render(
    <FormularioProducto
      form={form}
      onCambiar={() => {}}
      editando={false}
      inventarioActivo={false}
      errores={[]}
      onGuardar={() => {}}
      onCancelar={() => {}}
    />,
  );
}

const base: ProductoInput = {
  descripcion: "Arroz",
  costo: 100,
  pct_ganancia: 20,
  precio_venta: 120,
};

describe("FormularioProducto — precio sugerido de los niveles 2 y 3", () => {
  it("muestra en el placeholder costo+10% y costo+5% cuando los campos están vacíos", () => {
    formularioCon(base);
    expect(screen.getAllByPlaceholderText("110.00")).toHaveLength(1);
    expect(screen.getAllByPlaceholderText("105.00")).toHaveLength(1);
  });

  it("el sugerido nunca supera el precio de venta", () => {
    formularioCon({ ...base, precio_venta: 104 });
    expect(screen.getAllByPlaceholderText("104.00")).toHaveLength(2);
  });
});
