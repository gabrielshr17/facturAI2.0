import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dashboard remoto del dueño: cliente Vite+React independiente que habla
// DIRECTO contra Supabase (@supabase/supabase-js), no una PWA instalable
// (por eso no lleva vite-plugin-pwa como packages/web).
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  css: {
    // Objeto explícito (aunque vacío) evita que Vite busque un
    // postcss.config.* hacia arriba en el árbol de directorios, lo cual en
    // esta máquina encuentra un postcss.config.mjs ajeno en el home del
    // usuario (fuera del repo) y rompe el arranque. Mismo bloque que
    // packages/core, packages/ui y packages/web.
    postcss: { plugins: [] },
  },
});
