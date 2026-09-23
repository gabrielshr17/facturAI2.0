import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  AppShell,
  ProveedorDatos,
  ProveedorSesion,
  Acceso,
  useSesion,
  configurarAdaptadorImpresora,
  configurarAdaptadorImpresoraTexto,
  ejecutarManejadorCierreVentana,
} from "@sfr/ui";
import { migrate, seed, crearUsuarioRepo, type SqlDriver } from "@sfr/core";
import { crearTauriSqlDriver } from "./db/tauri-sql-driver.js";
import {
  adaptadorImpresoraTauri,
  adaptadorImpresoraTextoTauri,
} from "./impresora/tauri-impresora.js";
import { iniciarSincronizacionEnSegundoPlano } from "./sync/arrancar.js";
import "@sfr/ui/estilos-globales.css";

configurarAdaptadorImpresora(adaptadorImpresoraTauri);
configurarAdaptadorImpresoraTexto(adaptadorImpresoraTextoTauri);

/**
 * Cerrar la ventana con el botón nativo del sistema operativo (§ CAJA): igual que "Cerrar
 * sesión", pide contar el efectivo si hay un turno propio abierto. `preventDefault()`
 * frena el cierre nativo hasta que `AppShell` (vía `ejecutarManejadorCierreVentana`,
 * `@sfr/ui`) decida — `destroy()` en vez de `close()` es a propósito: `close()` volvería a
 * disparar este mismo evento y crearía un bucle infinito, `destroy()` cierra de verdad sin
 * pasar de nuevo por `onCloseRequested`. Antes de que `AppShell` se monte (pantalla de
 * login, carga inicial) no hay ningún manejador registrado todavía, así que
 * `ejecutarManejadorCierreVentana` deja cerrar sin preguntar nada.
 */
void getCurrentWindow().onCloseRequested(async (evento) => {
  evento.preventDefault();
  const resultado = await ejecutarManejadorCierreVentana();
  if (resultado === "cerrar") await getCurrentWindow().destroy();
});

/** Ver `packages/web/src/main.tsx` para el porqué de esta compuerta (§ RBAC-05). */
function Compuerta({ plataforma }: { plataforma: "Web" | "Escritorio" }) {
  const { autenticado } = useSesion();
  return autenticado ? <AppShell plataforma={plataforma} /> : <Acceso />;
}

/**
 * Arranque del escritorio: inicializa SQLite (tauri-plugin-sql, archivo real),
 * aplica migraciones y siembra datos de ejemplo la primera vez. Mismo patrón
 * que `packages/web/src/main.tsx` (ver ese archivo para el porqué del guard
 * contra el doble-montaje de StrictMode).
 */
function App() {
  const [db, setDb] = useState<SqlDriver | null>(null);
  const [error, setError] = useState<string | null>(null);

  const iniciado = useRef(false);
  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    void (async () => {
      try {
        const driver = await crearTauriSqlDriver();
        await migrate(driver);
        await seed(driver);
        setDb(driver);
        // No puede lanzar (arrancar.ts solo loguea y sigue si algo falla): un
        // fallo de sincronización remota jamás debe impedir que la caja
        // arranque en modo offline.
        iniciarSincronizacionEnSegundoPlano(driver);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui", color: "#dc2626" }}>
        Error al iniciar la base de datos: {error}
      </div>
    );
  }
  if (!db) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui", color: "#6b7280" }}>
        Cargando base de datos…
      </div>
    );
  }
  async function revalidarUsuarioActivo(usuarioId: string): Promise<boolean> {
    const fila = await crearUsuarioRepo(db!).obtener(usuarioId);
    return fila?.activo === 1;
  }
  return (
    <ProveedorSesion db={db} revalidarUsuarioActivo={revalidarUsuarioActivo}>
      <ProveedorDatos>
        <Compuerta plataforma="Escritorio" />
      </ProveedorDatos>
    </ProveedorSesion>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
