// Pruebas de humo de RBAC-06 sobre SeccionBitacora: la columna "Usuario" resuelve el
// nombre con un mapa cargado una sola vez desde `usuarioRepo.listar()` (nunca una
// consulta por fila), y una fila con `usuario_id` NULL (bitácora de antes de
// RBAC-04/05) se muestra como '—' en vez de romper o dejar la celda vacía.
//
// Arma el árbol a mano (en vez de `renderConDatos`, § test/_render.tsx) porque acá hace
// falta insertar filas de bitácora ANTES del primer render: `renderConDatos` crea su
// propia base ":memory:" en cada llamada, así que dos llamadas nunca comparten datos.
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { migrate, seed, crearRepos, SESION_LOCAL } from "@sfr/core";
import { createNodeSqliteDriver } from "../../core/src/db/drivers/node-sqlite.js";
import { SeccionBitacora } from "../src/componentes/SeccionBitacora.js";
import { ProveedorDatos } from "../src/data/contexto.js";
import { ProveedorSesion } from "../src/sesion/contexto.js";

beforeEach(() => {
  localStorage.clear();
});

describe("SeccionBitacora — columna Usuario (humo, RBAC-06)", () => {
  it("colSpan de la fila vacía es 5 cuando no hay registros", async () => {
    const db = createNodeSqliteDriver();
    await migrate(db);
    await seed(db);

    render(
      <ProveedorSesion db={db} sesionInicial={SESION_LOCAL}>
        <ProveedorDatos><SeccionBitacora /></ProveedorDatos>
      </ProveedorSesion>,
    );

    const tabla = await screen.findByRole("table");
    const filaVacia = within(tabla).getByText("Sin registros todavía.");
    expect(filaVacia.getAttribute("colspan")).toBe("5");
  });

  it("resuelve usuario_id a nombre con un solo listar(), y usuario_id NULL se muestra como '—'", async () => {
    const db = createNodeSqliteDriver();
    await migrate(db);
    await seed(db);
    const repos = crearRepos(db);

    const usuario = await repos.usuario.crear({ nombre: "Wendy Cajera", rol: "cajero" });
    await repos.bitacora.registrar({ usuarioId: usuario.id, accion: "cobrar", entidad: "factura" });
    await repos.bitacora.registrar({ usuarioId: null, accion: "cobrar", entidad: "factura" });

    render(
      <ProveedorSesion db={db} sesionInicial={SESION_LOCAL}>
        <ProveedorDatos><SeccionBitacora /></ProveedorDatos>
      </ProveedorSesion>,
    );

    const tabla = await screen.findByRole("table");
    expect(await within(tabla).findByText("Wendy Cajera")).toBeTruthy();
    const filasUsuario = within(tabla).getAllByRole("row").slice(1);
    // La fila del registro con usuario_id NULL muestra '—' en su celda de Usuario.
    const conGuion = filasUsuario.some((fila) => within(fila).queryAllByText("—").length > 0);
    expect(conGuion).toBe(true);
  });
});
