import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Este paquete SI usa CSS (estilos-globales.css), a diferencia de @sfr/core, pero el
// bloque css.postcss vacio se copia igual: sin el, Vite busca un postcss.config.* hacia
// arriba en el arbol de directorios, encuentra uno ajeno en el home de esta maquina y
// rompe la corrida antes de montar un solo componente. Ver packages/core/vitest.config.ts.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // @sfr/core y @sfr/ui se consumen como TypeScript crudo (main/types -> ./src/index.ts,
    // sin build): vitest transpila ambos con esbuild al vuelo, así que no hace falta mapear
    // nada aparte — basta con que el resolvedor de Node/Vite siga el import de workspace.
    setupFiles: ["./test/setup-crypto.ts", "./test/setup-testing-library.ts"],
  },
  css: {
    // Objeto explícito (aunque vacío) evita que Vite busque un
    // postcss.config.* hacia arriba en el árbol de directorios.
    postcss: { plugins: [] },
  },
});
