/**
 * Interfaz de driver SQL agnóstica del motor.
 *
 * El `core` no conoce el motor concreto: en escritorio será `tauri-plugin-sql`
 * (rusqlite), en la PWA `wa-sqlite`, y en Node (tests/seed/migraciones) el
 * módulo integrado `node:sqlite`. Todos implementan esta interfaz.
 *
 * Los métodos son asíncronos para acomodar drivers de navegador (WASM);
 * los drivers síncronos simplemente resuelven de inmediato.
 *
 * `enTransaccion` es OPCIONAL por diseño, no un descuido: `tauri-plugin-sql`
 * ejecuta cada `db.execute()` contra un *pool* de conexiones de sqlx, y cada
 * llamada puede tomar una conexión distinta del pool. Un `BEGIN` emitido por
 * una llamada no envuelve las llamadas siguientes si sqlx las sirve desde
 * otra conexión, así que una "transacción" ahí sería una ilusión peor que no
 * tener ninguna (rollback que no revierte nada, o una conexión del pool que
 * queda con una transacción abierta colgada). Por eso el driver de escritorio
 * deja el método `undefined` en vez de fingir una atomicidad que no puede
 * dar: ver packages/desktop/src/db/tauri-sql-driver.ts. Los consumidores
 * (migrator.ts) comprueban `db.enTransaccion` antes de usarlo y caen a su
 * comportamiento actual sin transacción cuando no está disponible.
 */
export interface SqlDriver {
  /** Ejecuta uno o varios statements (usado por migraciones). */
  exec(sql: string): Promise<void>;
  /** Ejecuta un statement con parámetros (INSERT/UPDATE/DELETE). */
  run(sql: string, params?: unknown[]): Promise<void>;
  /** Devuelve todas las filas de un SELECT. */
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Devuelve la primera fila de un SELECT, o undefined. */
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** Cierra la conexión (opcional según el driver). */
  close?(): Promise<void>;
  /**
   * Ejecuta `fn` dentro de BEGIN/COMMIT, con ROLLBACK y re-lanzamiento del
   * error original si `fn` falla. Opcional: solo lo ofrecen los drivers con
   * una conexión única real (node:sqlite, sql.js). Ver el comentario de la
   * interfaz para por qué Tauri no puede implementarlo de verdad.
   */
  enTransaccion?<T>(fn: () => Promise<T>): Promise<T>;
}
