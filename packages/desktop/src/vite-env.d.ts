/// <reference types="vite/client" />

/**
 * Variables de entorno propias de esta app, leídas por
 * packages/desktop/src/sync/arrancar.ts en tiempo de ejecución (nunca
 * embebidas como secretos "hardcoded" — ver packages/desktop/.env.example).
 * Todas son opcionales a nivel de tipo porque la sincronización debe poder
 * faltar sin romper el arranque de la caja (modo 100% offline).
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SYNC_EMAIL?: string;
  readonly VITE_SYNC_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
