import { describe, it, expect } from "vitest";
import { hashearPin, verificarPin, CriptoNoDisponibleError } from "../src/dominio/pin.js";

describe("hashearPin — formato versionado pbkdf2$iteraciones$salt$hash", () => {
  it("devuelve cuatro segmentos separados por '$' con 'pbkdf2' primero", async () => {
    const hash = await hashearPin("1234");
    const segmentos = hash.split("$");
    expect(segmentos).toHaveLength(4);
    expect(segmentos[0]).toBe("pbkdf2");
  });

  it("dos llamadas con el mismo PIN dan hashes distintos por el salt aleatorio", async () => {
    const a = await hashearPin("1234");
    const b = await hashearPin("1234");
    expect(a).not.toBe(b);
  });
});

describe("verificarPin", () => {
  it("acepta el PIN correcto y rechaza uno incorrecto", async () => {
    const hash = await hashearPin("1234");
    expect(await verificarPin("1234", hash)).toBe(true);
    expect(await verificarPin("1235", hash)).toBe(false);
  });

  it("lee las iteraciones DEL hash, no de una constante", async () => {
    const iteracionesDistintas = 120000;
    const salt = new Uint8Array(16).fill(7);
    const claveDerivada = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt,
        iterations: iteracionesDistintas,
      },
      await crypto.subtle.importKey("raw", new TextEncoder().encode("1234"), "PBKDF2", false, ["deriveBits"]),
      256,
    );
    const hashManual = `pbkdf2$${iteracionesDistintas}$${Buffer.from(salt).toString("base64")}$${Buffer.from(
      claveDerivada,
    ).toString("base64")}`;
    expect(await verificarPin("1234", hashManual)).toBe(true);
  });
});

describe("CriptoNoDisponibleError — contexto inseguro sin crypto.subtle", () => {
  it("hashearPin rechaza con un mensaje que menciona https o localhost", async () => {
    // `crypto.subtle` es un accessor de solo lectura en Node: no se puede reasignar
    // in-place. Se reemplaza el `globalThis.crypto` entero por uno equivalente sin
    // `subtle`, para simular la PWA servida por http:// sobre la LAN (contexto inseguro).
    const cryptoOriginal = globalThis.crypto;
    const cryptoSinSubtle = {
      randomUUID: cryptoOriginal.randomUUID.bind(cryptoOriginal),
      getRandomValues: cryptoOriginal.getRandomValues.bind(cryptoOriginal),
      subtle: undefined,
    };
    Object.defineProperty(globalThis, "crypto", {
      value: cryptoSinSubtle,
      configurable: true,
    });
    try {
      await expect(hashearPin("1234")).rejects.toBeInstanceOf(CriptoNoDisponibleError);
      await expect(hashearPin("1234")).rejects.toThrow(/https|localhost/i);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        value: cryptoOriginal,
        configurable: true,
      });
    }
  });
});
