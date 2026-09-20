// Sincronización en segundo plano hacia Supabase/PowerSync (§ tarea
// "sync caja"). Este módulo es completamente ajeno a la sesión de PIN del
// cajero (packages/core/src/db/sesion.ts, packages/ui/src/sesion): arranca
// una sola vez al iniciar la app de escritorio y sigue corriendo sin
// importar quién (o si alguien) tiene sesión local abierta.
mod conector;

pub use conector::{iniciar_sincronizacion, ConectorSincronizacionSupabase};
