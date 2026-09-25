import type { SqlDriver } from "../db/driver.js";
import {
  crearSincronizadorEntrante,
  type OpcionesSincronizacionEntrante,
} from "./bajada-entrante.js";
import {
  crearSincronizadorSaliente,
  type ConfigSincronizacionSaliente,
} from "./subida-saliente.js";

export interface SincronizadorBidireccional {
  sincronizar(): Promise<void>;
}

export function crearSincronizadorBidireccional(
  db: SqlDriver,
  config: ConfigSincronizacionSaliente,
  peticion: typeof fetch = fetch,
  opcionesEntrantes: OpcionesSincronizacionEntrante = {},
): SincronizadorBidireccional {
  const entrante = crearSincronizadorEntrante(db, config, peticion, opcionesEntrantes);
  const saliente = crearSincronizadorSaliente(db, config, peticion);
  let enCurso = false;
  return {
    async sincronizar(): Promise<void> {
      if (enCurso) return;
      enCurso = true;
      try {
        await entrante.sincronizar();
        await saliente.sincronizar();
      } finally {
        enCurso = false;
      }
    },
  };
}
