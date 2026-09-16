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
import {
  migrate,
  seed,
  type SqlDriver,
  crearProductoRepo,
  crearClienteRepo,
  crearDepartamentoRepo,
  crearNegocioRepo,
  crearFacturaRepo,
  crearSecuenciaNcfRepo,
  crearComprobanteFiscalRepo,
  crearProveedorFiscalSimulado,
  crearCorteCajaRepo,
  crearMovimientoInventarioRepo,
  crearProveedorRepo,
  crearCompraRepo,
  crearComprobanteArchivoRepo,
  crearBitacoraRepo,
  crearDevolucionRepo,
  crearReportesRepo,
  crearPromocionRepo,
  crearBackupRepo,
  crearCotizacionRepo,
} from "@sfr/core";
import { createNodeSqliteDriver } from "../../core/src/db/drivers/node-sqlite.js";
import { ProveedorDatos, type Repos } from "../src/data/contexto.js";

// `crearRepos(db)` todavía no existe (llega en PLATAFORMA-07, el andamio de
// `repos/registro.ts`): mientras tanto se construye aquí el mismo literal de 18 repos que
// hoy vive en `<ProveedorDatos>`. Cuando ese andamio aterrice, esta función se reemplaza por
// una sola llamada a `crearRepos(db)` y el resto de este archivo no cambia.
function crearReposDePrueba(db: SqlDriver): Repos {
  return {
    producto: crearProductoRepo(db),
    cliente: crearClienteRepo(db),
    departamento: crearDepartamentoRepo(db),
    negocio: crearNegocioRepo(db),
    factura: crearFacturaRepo(db),
    secuenciaNcf: crearSecuenciaNcfRepo(db),
    comprobanteFiscal: crearComprobanteFiscalRepo(db),
    corteCaja: crearCorteCajaRepo(db),
    movimientoInventario: crearMovimientoInventarioRepo(db),
    proveedor: crearProveedorRepo(db),
    compra: crearCompraRepo(db),
    comprobanteArchivo: crearComprobanteArchivoRepo(db),
    bitacora: crearBitacoraRepo(db),
    devolucion: crearDevolucionRepo(db),
    reportes: crearReportesRepo(db),
    promocion: crearPromocionRepo(db),
    backup: crearBackupRepo(db),
    cotizacion: crearCotizacionRepo(db),
    proveedorFiscal: crearProveedorFiscalSimulado(),
  };
}

export interface ResultadoRenderConDatos extends RenderResult {
  db: SqlDriver;
  repos: Repos;
}

/**
 * Monta `ui` dentro de `<ProveedorDatos>` sobre una base `:memory:` recién creada, migrada y
 * sembrada. Devuelve, además de lo habitual de `render()`, el `db` y los `repos` ya
 * construidos, para que una prueba pueda inspeccionar o mutar el estado sin tener que armar
 * un componente-sonda cada vez.
 */
export async function renderConDatos(ui: ReactElement): Promise<ResultadoRenderConDatos> {
  const db = createNodeSqliteDriver();
  await migrate(db);
  await seed(db);
  const repos = crearReposDePrueba(db);
  const resultado = render(<ProveedorDatos db={db}>{ui}</ProveedorDatos>);
  return { ...resultado, db, repos };
}
