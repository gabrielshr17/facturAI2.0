// Prueba de la propia herramienta de pruebas: si `renderConDatos` no migra Y siembra una
// base real antes de montar, cualquier pantalla que llame a `useRepos` explota al primer
// render (los repos existen, pero las tablas no). Y si dos llamadas reutilizaran la MISMA
// base en memoria, una prueba dejaría filas que la siguiente prueba vería sin haberlas
// creado — el motivo por el que node:sqlite se abre en ":memory:" una vez por llamada.
import { describe, expect, it } from "vitest";
import { useRepos } from "../src/data/contexto.js";
import { renderConDatos } from "./_render.js";

function SondaRepos() {
  const repos = useRepos();
  return <span data-testid="sonda">{repos.producto ? "con-repos" : "sin-repos"}</span>;
}

describe("_render/renderConDatos", () => {
  it("monta una pantalla que consume useRepos sin lanzar, contra una base migrada y sembrada", async () => {
    const { getByTestId, repos } = await renderConDatos(<SondaRepos />);
    expect(getByTestId("sonda").textContent).toBe("con-repos");
    // El seed de @sfr/core siempre inserta "prod-arroz": si esto está vacío, la base
    // se montó sin `migrate`/`seed`, no solo sin datos.
    const productos = await repos.producto.listar();
    expect(productos.length).toBeGreaterThan(0);
  });

  it("dos llamadas consecutivas a renderConDatos no comparten estado de base entre si", async () => {
    const primera = await renderConDatos(<SondaRepos />);
    const antes = await primera.repos.producto.listar();
    await primera.repos.producto.crear({ descripcion: "Producto solo de la primera base" });
    const despues = await primera.repos.producto.listar();
    expect(despues.length).toBe(antes.length + 1);

    const segunda = await renderConDatos(<SondaRepos />);
    const productosSegunda = await segunda.repos.producto.listar();
    expect(productosSegunda.length).toBe(antes.length);
    expect(
      productosSegunda.some((p) => p.descripcion === "Producto solo de la primera base"),
    ).toBe(false);
  });
});
