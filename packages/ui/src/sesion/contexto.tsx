/**
 * Proveedor de sesión del lado de la UI (§ PLATAFORMA-07, ola 2).
 *
 * Imita EXACTAMENTE el molde de `data/contexto.tsx` (`useRepos`) y de
 * `contexto/Alertas.tsx` (`useAlertas`): `createContext<T | null>(null)` y un hook que
 * lanza `Error` con mensaje en español si falta el proveedor. `AppShell` es quien monta
 * `<ProveedorSesion>` por defecto (con `SESION_LOCAL`, § `dominio/permisos.ts`) alrededor
 * de todo su árbol — igual que ya hace con `<ProveedorAlertas>` — así que ninguna
 * instalación existente (`packages/web/src/main.tsx`, `packages/desktop/src/main.tsx`,
 * ninguno de los dos tocado por esta tarea) necesita cambiar una línea: sin login real
 * todavía (RBAC-05 es tarea futura), el rol es `superadmin` con todos los permisos y
 * ningún módulo se oculta. Lo que SÍ lanza es llamar a `useSesion()` fuera de cualquier
 * `<ProveedorSesion>` — igual que `useRepos()` fuera de `<ProveedorDatos>` — porque ahí
 * ya no hay ninguna garantía de qué sesión asumir.
 *
 * `useSesionOpcional` (sin el `!ctx` que lanza) es de uso interno: `data/contexto.tsx`
 * la usa para decidir si `<ProveedorDatos>` necesita montar un `<ProveedorSesion>` por
 * defecto o si ya hay uno explícito por encima (p. ej. en una prueba) al que no hay que
 * pisarle la sesión.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import { SESION_LOCAL, type PortadorSesion } from "@sfr/core";

export interface SesionApi {
  sesion: PortadorSesion;
  establecerSesion(s: PortadorSesion): void;
}

const SesionContext = createContext<SesionApi | null>(null);

export function ProveedorSesion({ children, sesionInicial = SESION_LOCAL }: { children: ReactNode; sesionInicial?: PortadorSesion }) {
  const [sesion, establecerSesion] = useState<PortadorSesion>(sesionInicial);
  return (
    <SesionContext.Provider value={{ sesion, establecerSesion }}>
      {children}
    </SesionContext.Provider>
  );
}

export function useSesion(): SesionApi {
  const ctx = useContext(SesionContext);
  if (!ctx) throw new Error("useSesion debe usarse dentro de <ProveedorSesion>");
  return ctx;
}

export function useSesionOpcional(): SesionApi | null {
  return useContext(SesionContext);
}
