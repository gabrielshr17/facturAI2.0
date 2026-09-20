mod impresora;
mod sync;

// Punto de entrada de la app Tauri. Registra el plugin SQL (SQLite local),
// que expone la base de datos al frontend por la misma interfaz `SqlDriver`
// que implementa el paquete `core`, y el plugin de PowerSync, que sincroniza
// en segundo plano hacia Supabase sin depender de la sesión de PIN del
// cajero (ver packages/desktop/src/sync).
pub fn run() {
    // Carga packages/desktop/.env si existe (no falla si falta: en build de
    // producción las variables deberían venir del entorno del sistema, no de
    // un archivo). Se hace antes de que cualquier comando necesite las
    // variables de Supabase/PowerSync.
    if let Err(e) = dotenvy::dotenv() {
        eprintln!("aviso: no se cargó packages/desktop/.env ({e})");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_powersync::init())
        .invoke_handler(tauri::generate_handler![
            impresora::listar_impresoras,
            impresora::imprimir_ticket_termico,
            impresora::imprimir_texto_generico,
            sync::iniciar_sincronizacion
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar la aplicación Tauri");
}
