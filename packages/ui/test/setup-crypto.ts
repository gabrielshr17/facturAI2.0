// jsdom (el entorno DOM que usa vitest para @sfr/ui) NO implementa `crypto.subtle`: el
// objeto global `crypto` que expone es un stub sin `SubtleCrypto`. `dominio/pin.ts` de
// @sfr/core (RBAC-02) construye el hash de PIN con PBKDF2 sobre `globalThis.crypto.subtle`,
// y la pantalla de Acceso por PIN (RBAC-05, ola posterior) lo va a llamar desde una prueba
// de UI montada con `renderConDatos`. Sin este shim, cualquier prueba que toque ese camino
// lanzaría el mismo error reservado a "no hay contexto seguro" (PWA por http:// en la LAN),
// pero por un motivo de entorno de pruebas, no del negocio.
// Node trae su propia implementación de WebCrypto completa (incluye `subtle`) desde la
// version 19; se la inyectamos al global antes de que corra cualquier test.
import { webcrypto } from "node:crypto";

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}
