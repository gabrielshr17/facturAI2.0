mod impresora;

/*
 * La sincronización hacia Supabase NO vive en Rust (ver
 * packages/core/src/sync/subida-saliente.ts): antes se intentó con
 * PowerSync (tauri-plugin-powersync), pero esa integración mantenía su
 * propia base local separada de la que usan los repos vía tauri-plugin-sql,
 * así que nunca subía nada de verdad — y además tauri-plugin-powersync y
 * tauri-plugin-sql piden versiones incompatibles de libsqlite3-sys,
 * rompiendo `cargo check`. El reemplazo es JS/fetch puro (misma base
 * SQLite local de siempre, una cola de pendientes marcada por triggers,
 * subida vía PostgREST directo) y corre igual en el webview de escritorio
 * que en la PWA — no necesita nada del lado de Rust.
 */

// Punto de entrada de la app Tauri. Registra el plugin SQL (SQLite local),
// que expone la base de datos al frontend por la misma interfaz `SqlDriver`
// que implementa el paquete `core`.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            impresora::listar_impresoras,
            impresora::imprimir_ticket_termico,
            impresora::imprimir_texto_generico,
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar la aplicación Tauri");
}
