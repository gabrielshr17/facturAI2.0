import { describe, it, expect } from "vitest";
import {
  DESFASE_RD_MIN,
  fechaLocalDeInstante,
  horaLocalDeInstante,
  inicioDiaUtc,
  finDiaUtcExclusivo,
  rangoUtc,
  modificadorSqlite,
  hoyLocal,
  primerDiaDelMesLocal,
  periodoAnterior,
  mesAnteriorDe,
} from "../src/dominio/periodo.js";

describe("periodo — fechaLocalDeInstante", () => {
  it("una venta de las 22:30 hora local cae en el día UTC siguiente", () => {
    expect(fechaLocalDeInstante("2026-03-15T02:30:00.000Z", DESFASE_RD_MIN)).toBe("2026-03-14");
  });

  it("la medianoche local exacta pertenece al día nuevo", () => {
    expect(fechaLocalDeInstante("2026-03-15T04:00:00.000Z", DESFASE_RD_MIN)).toBe("2026-03-15");
  });
});

describe("periodo — horaLocalDeInstante", () => {
  it("el pico de las 7pm no se reporta a las 11pm", () => {
    expect(horaLocalDeInstante("2026-03-15T23:10:00.000Z", DESFASE_RD_MIN)).toBe(19);
  });
});

describe("periodo — inicioDiaUtc / finDiaUtcExclusivo", () => {
  it("RD (UTC-4): el día local empieza 4 horas después de la medianoche UTC", () => {
    expect(inicioDiaUtc("2026-03-15", DESFASE_RD_MIN)).toBe("2026-03-15T04:00:00.000Z");
    expect(finDiaUtcExclusivo("2026-03-15", DESFASE_RD_MIN)).toBe("2026-03-16T04:00:00.000Z");
  });

  it("desfase 0: el rango de un día es exactamente medianoche a medianoche UTC", () => {
    expect(inicioDiaUtc("2026-03-15", 0)).toBe("2026-03-15T00:00:00.000Z");
    expect(finDiaUtcExclusivo("2026-03-15", 0)).toBe("2026-03-16T00:00:00.000Z");
  });

  it("desfase positivo (+330, India): el día local empieza antes de la medianoche UTC", () => {
    expect(inicioDiaUtc("2026-03-15", 330)).toBe("2026-03-14T18:30:00.000Z");
  });
});

describe("periodo — rangoUtc", () => {
  it("cubre el mes completo y el último día entra entero", () => {
    const r = rangoUtc("2026-03-01", "2026-03-31", DESFASE_RD_MIN);
    expect(r.inicio).toBe("2026-03-01T04:00:00.000Z");
    expect(r.finExclusivo).toBe("2026-04-01T04:00:00.000Z");
  });
});

describe("periodo — modificadorSqlite", () => {
  it("negativo", () => {
    expect(modificadorSqlite(-240)).toBe("-240 minutes");
  });

  it("positivo lleva signo +", () => {
    expect(modificadorSqlite(330)).toBe("+330 minutes");
  });
});

describe("periodo — hoyLocal / primerDiaDelMesLocal", () => {
  it("con hora actual inyectada", () => {
    const ahora = new Date("2026-03-15T03:00:00.000Z");
    expect(hoyLocal(DESFASE_RD_MIN, ahora)).toBe("2026-03-14");
    expect(primerDiaDelMesLocal(DESFASE_RD_MIN, ahora)).toBe("2026-03-01");
  });
});

describe("periodo — periodoAnterior", () => {
  it("misma cantidad de días, pegado al inicio del período dado", () => {
    expect(periodoAnterior("2026-03-10", "2026-03-16")).toEqual({
      desde: "2026-03-03",
      hasta: "2026-03-09",
    });
  });
});

describe("periodo — mesAnteriorDe", () => {
  it("cruza el año correctamente", () => {
    expect(mesAnteriorDe("2026-01-15")).toEqual({ desde: "2025-12-01", hasta: "2025-12-31" });
  });

  it("devuelve febrero completo (no bisiesto)", () => {
    expect(mesAnteriorDe("2026-03-31")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
  });
});
