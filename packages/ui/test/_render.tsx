// Helper de pruebas para @sfr/ui: monta una pantalla (o el AppShell entero) contra una base
// SQLite real, migrada y sembrada, en vez de un doble/mock de los repos. `@sfr/core` guarda
// TODA su lógica de negocio en la capa de repos (Controller-Service del lado del dato), así
// que mockear `useRepos` dejaría sin cubrir justo lo que rompe en producción: una migración
// que falla a la mitad, un `COLS`/`Array(N)` desalineado, una regla de validación del repo.
//
// `createNodeSqliteDriver` NO está en el barrel de `@sfr/core` a propósito (usa `node:sqlite`,
// que un bundle de navegador no debe arrastrar): se importa por ruta directa al archivo
// fuente, tal como pide el brief de PLATAFORMA-06. `@sfr/core` se consume como TypeScript
// crudo (sin build), así que Vitest transpila esta ruta igual que cualquier otro import del
// workspace.
//
// `migrate`/`seed` son async y `render()` de Testing Library es síncrono: por eso
// `renderConDatos` es async — resuelve la base ANTES de montar el árbol, para que la
// pantalla vea datos reales desde su primer render en vez de a mitad de un efecto.
//
// Cada llamada crea su PROPIA base ":memory:" (el valor por defecto del driver): dos
// pruebas que llamen a `renderConDatos` por separado nunca comparten una fila, porque cada
// una abre su propia instancia de `node:sqlite` y ninguna la persiste a disco.
import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { migrate, seed, crearRepos, type SqlDriver, type PortadorSesion } from "@sfr/core";
import { createNodeSqliteDriver } from "../../core/src/db/drivers/node-sqlite.js";
import { ProveedorDatos, type Repos } from "../src/data/contexto.js";
import { ProveedorSesion } from "../src/sesion/contexto.js";

export interface ResultadoRenderConDatos extends RenderResult {
  db: SqlDriver;
  repos: Repos;
}

/**
 * Monta `ui` dentro de `<ProveedorDatos>` sobre una base `:memory:` recién creada, migrada y
 * sembrada. Devuelve, además de lo habitual de `render()`, el `db` y los `repos` ya
 * construidos, para que una prueba pueda inspeccionar o mutar el estado sin tener que armar
 * un componente-sonda cada vez.
 *
 * `crearRepos(db)` (`@sfr/core`, § PLATAFORMA-07) reemplazó al literal de 18 repos que este
 * archivo construía a mano — ver el aviso que había aquí antes de esa tarea.
 *
 * `sesion`, si se pasa, monta un `<ProveedorSesion sesionInicial={sesion}>` POR FUERA de
 * `<ProveedorDatos>`: `ProveedorDatos` detecta que ya hay una sesión explícita por encima
 * (§ `ProveedorSesionSiFalta` en `data/contexto.tsx`) y no la pisa con `SESION_LOCAL`. Sin
 * este parámetro, el comportamiento es el de cualquier instalación real: `SESION_LOCAL`,
 * todos los módulos visibles.
 */
export async function renderConDatos(ui: ReactElement, sesion?: PortadorSesion): Promise<ResultadoRenderConDatos> {
  const db = createNodeSqliteDriver();
  await migrate(db);
  await seed(db);
  const repos = crearRepos(db);
  const arbol = <ProveedorDatos db={db}>{ui}</ProveedorDatos>;
  const resultado = render(sesion ? <ProveedorSesion sesionInicial={sesion}>{arbol}</ProveedorSesion> : arbol);
  return { ...resultado, db, repos };
}
