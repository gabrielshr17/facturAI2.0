/**
 * Hash de PIN isomórfico (§ RBAC-02, `plan/00-CONVENCIONES.md` §3 "Hash de PIN").
 *
 * CERO dependencias de runtime a propósito: `packages/core/package.json` no tiene
 * ninguna hoy y tiene que seguir así, porque el mismo código corre en sql.js/navegador
 * (PWA), en el webview de Tauri (escritorio) y en `node:sqlite` bajo vitest — un
 * binding nativo tipo `bcrypt`/`argon2` rompería dos de los tres entornos. La única
 * primitiva que se usa es `crypto.subtle`, ya probada como disponible sin polyfill en
 * los tres runtimes (`packages/core/src/ids.ts:7` usa `crypto.randomUUID()` así).
 *
 * Formato del hash, versionado DENTRO del propio string:
 *   pbkdf2$<iteraciones>$<saltBase64>$<hashBase64>
 * `verificarPin` lee las iteraciones DEL string, nunca de una constante, para poder
 * subir el número en el futuro sin invalidar los PIN ya guardados en instalaciones
 * de clientes reales.
 *
 * `crypto.subtle` solo existe en un "contexto seguro": localhost o HTTPS. La PWA
 * puede servirse por `http://` sobre una IP de la LAN del negocio (para que el
 * teléfono del mostrador la abra sin instalar nada), y ahí `crypto.subtle` es
 * `undefined`. Se detecta explícitamente y se lanza `CriptoNoDisponibleError` con un
 * mensaje accionable, en vez de reventar con un `TypeError` opaco.
 */

const ITERACIONES_MINIMAS = 100_000;
const LARGO_SALT_BYTES = 16;
const ALGORITMO_HASH = "SHA-256";

export class CriptoNoDisponibleError extends Error {
  constructor() {
    super(
      "No se puede procesar el PIN: crypto.subtle no está disponible en este contexto. " +
        "Esto ocurre cuando la aplicación se sirve por http:// sobre una IP de la red local " +
        "(no es un 'contexto seguro'). Sirve la aplicación por HTTPS o accede por localhost.",
    );
    this.name = "CriptoNoDisponibleError";
  }
}

function exigirSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new CriptoNoDisponibleError();
  return subtle;
}

function bytesABase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binario = "";
  for (const b of arr) binario += String.fromCharCode(b);
  return btoa(binario);
}

function base64ABytes(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

async function derivar(
  pin: string,
  salt: Uint8Array,
  iteraciones: number,
  subtle: SubtleCrypto,
): Promise<Uint8Array> {
  const claveBase = await subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await subtle.deriveBits(
    { name: "PBKDF2", hash: ALGORITMO_HASH, salt: salt as BufferSource, iterations: iteraciones },
    claveBase,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashearPin(pin: string): Promise<string> {
  const subtle = exigirSubtle();
  const salt = new Uint8Array(LARGO_SALT_BYTES);
  crypto.getRandomValues(salt);
  const derivado = await derivar(pin, salt, ITERACIONES_MINIMAS, subtle);
  return `pbkdf2$${ITERACIONES_MINIMAS}$${bytesABase64(salt)}$${bytesABase64(derivado)}`;
}

/** Compara dos bufers en tiempo constante: recorre TODOS los bytes acumulando XOR. */
function sonIguales(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a[i] ^ b[i];
  return diferencia === 0;
}

export async function verificarPin(pin: string, hash: string): Promise<boolean> {
  const subtle = exigirSubtle();
  const partes = hash.split("$");
  if (partes.length !== 4 || partes[0] !== "pbkdf2") return false;

  const iteraciones = Number(partes[1]);
  if (!Number.isInteger(iteraciones) || iteraciones <= 0) return false;

  const salt = base64ABytes(partes[2]);
  const esperado = base64ABytes(partes[3]);
  const obtenido = await derivar(pin, salt, iteraciones, subtle);
  return sonIguales(obtenido, esperado);
}
