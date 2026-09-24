import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModalCobro, type ModalCobroProps } from "../src/componentes/ModalCobro.js";

const ETIQUETA = "Cobrar 5% de recargo de tarjeta";

function montar() {
  const onConfirmar = vi.fn<ModalCobroProps["onConfirmar"]>(async () => {});
  render(
    <ModalCobro
      total={100}
      cantidadArticulos={1}
      onCancelar={() => {}}
      onConfirmar={onConfirmar}
    />,
  );
  return onConfirmar;
}

function elegirTarjeta() {
  fireEvent.change(screen.getByLabelText("Método de pago 1"), { target: { value: "tarjeta" } });
}

describe("ModalCobro — casilla del recargo de tarjeta", () => {
  it("no aparece si no se paga con tarjeta", () => {
    montar();
    expect(screen.queryByLabelText(ETIQUETA)).toBeNull();
  });

  it("aparece marcada al pagar con tarjeta y avisa que incluye el 5%", () => {
    montar();
    elegirTarjeta();
    const casilla = screen.getByLabelText(ETIQUETA) as HTMLInputElement;
    expect(casilla.checked).toBe(true);
    expect(
      screen.getByText(/Se cobrarán RD\$ 105\.00 en la tarjeta \(incluye 5% de recargo\)/),
    ).toBeTruthy();
  });

  it("al desmarcarla, el aviso muestra el monto sin recargo", () => {
    montar();
    elegirTarjeta();
    fireEvent.click(screen.getByLabelText(ETIQUETA));
    expect(screen.getByText(/Se cobrarán RD\$ 100\.00 en la tarjeta \(sin recargo\)/)).toBeTruthy();
  });

  it("confirma con cobrarRecargoTarjeta en true por defecto", async () => {
    const onConfirmar = montar();
    elegirTarjeta();
    fireEvent.click(screen.getByText("Cobrar sin imprimir (F2)"));
    await waitFor(() => expect(onConfirmar).toHaveBeenCalledTimes(1));
    expect(onConfirmar.mock.calls[0]?.[4]).toBe(true);
  });

  it("confirma con cobrarRecargoTarjeta en false si se desmarca", async () => {
    const onConfirmar = montar();
    elegirTarjeta();
    fireEvent.click(screen.getByLabelText(ETIQUETA));
    fireEvent.click(screen.getByText("Cobrar sin imprimir (F2)"));
    await waitFor(() => expect(onConfirmar).toHaveBeenCalledTimes(1));
    expect(onConfirmar.mock.calls[0]?.[4]).toBe(false);
  });
});
