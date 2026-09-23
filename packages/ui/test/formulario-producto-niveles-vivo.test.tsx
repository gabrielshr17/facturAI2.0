import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { ProductoInput } from "@sfr/core";
import { FormularioProducto } from "../src/componentes/FormularioProducto.js";

function Arnes({ inicial }: { inicial: ProductoInput }) {
  const [form, setForm] = useState<ProductoInput>(inicial);
  return (
    <FormularioProducto
      form={form}
      onCambiar={setForm}
      editando
      inventarioActivo={false}
      errores={[]}
      onGuardar={() => {}}
      onCancelar={() => {}}
    />
  );
}

function campo(etiqueta: string): HTMLInputElement {
  const el = screen.getByText(new RegExp(`^${etiqueta}`)).parentElement?.querySelector("input");
  if (!el) throw new Error(`No hay campo ${etiqueta}`);
  return el;
}

const base: ProductoInput = {
  descripcion: "Arroz",
  costo: 100,
  pct_ganancia: 20,
  precio_venta: 120,
  precio_2: 110,
  precio_3: 105,
};

describe("FormularioProducto — los niveles automáticos siguen al costo", () => {
  it("al cambiar el costo, los niveles que eran el sugerido se recalculan", () => {
    render(<Arnes inicial={base} />);
    fireEvent.change(campo("Costo"), { target: { value: "200" } });
    expect(campo("Precio nivel 2").value).toBe("220");
    expect(campo("Precio nivel 3").value).toBe("210");
  });

  it("un nivel escrito a mano no se toca al cambiar el costo", () => {
    render(<Arnes inicial={{ ...base, precio_2: 999 }} />);
    fireEvent.change(campo("Costo"), { target: { value: "200" } });
    expect(campo("Precio nivel 2").value).toBe("999");
    expect(campo("Precio nivel 3").value).toBe("210");
  });

  it("al cambiar el % de ganancia, un nivel automático respeta el tope del precio de venta", () => {
    render(<Arnes inicial={base} />);
    fireEvent.change(campo("% Ganancia"), { target: { value: "3" } });
    expect(campo("Precio nivel 2").value).toBe("103");
    expect(campo("Precio nivel 3").value).toBe("103");
  });

  it("un nivel vacío sigue vacío (se muestra el sugerido en gris)", () => {
    render(<Arnes inicial={{ ...base, precio_2: null }} />);
    fireEvent.change(campo("Costo"), { target: { value: "200" } });
    expect(campo("Precio nivel 2").value).toBe("");
    expect(campo("Precio nivel 2").placeholder).toBe("220.00");
  });
});
