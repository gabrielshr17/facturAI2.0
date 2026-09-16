// Testing Library limpia el DOM solo entre pruebas cuando detecta un `afterEach` GLOBAL (el
// que Jest expone por defecto). Este repo llama a Vitest importando `afterEach` de "vitest"
// en cada archivo en vez de con `test.globals: true` en vitest.config.ts, así que la
// detección automática de Testing Library nunca se dispara y el DOM de una prueba queda
// montado para la siguiente. Sin este registro explícito, `appshell-humo.test.tsx` monta el
// AppShell en varias pruebas seguidas y `screen.getByRole("navigation", ...)` empieza a
// encontrar más de un <nav> (uno por prueba anterior) y falla por ambigüedad, no por un bug
// real de la pantalla.
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
