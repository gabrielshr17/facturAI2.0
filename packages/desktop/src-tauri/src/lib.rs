mod impresora;
// `sync` (conector PowerSync) DESACTIVADO TEMPORALMENTE — ver Cargo.toml:
// `tauri-plugin-powersync` y `powersync` (via rusqlite) piden una version de
// `libsqlite3-sys` incompatible con la que ya trae `tauri-plugin-sql` (via
// sqlx-sqlite), y Cargo no permite dos crates enlazando la misma libreria
// nativa `sqlite3` — `cargo check` falla en resolucion de dependencias antes
// de compilar nada. Ademas, el conector como estaba escrito no sincronizaba
// datos reales (PowerSyncDatabase mantiene su propia base local, separada de
// la que usan los repos de la app vía tauri-plugin-sql, asi que su cola de
// subida siempre estaba vacía). Reactivar solo junto con el rediseño real:
// que el driver local de la app sea el de PowerSync, no uno aparte.
// mod sync;

// Punto de entrada de la app Tauri. Registra el plugin SQL (SQLite local),
// que expone la base de datos al frontend por la misma interfaz `SqlDriver`
// que implementa el paquete `core`.
pub fn run() {
    // Carga packages/desktop/.env si existe (no falla si falta: en build de
    // producción las variables deberían venir del entorno del sistema, no de
    // un archivo).
    if let Err(e) = dotenvy::dotenv() {
        eprintln!("aviso: no se cargó packages/desktop/.env ({e})");
    }

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
