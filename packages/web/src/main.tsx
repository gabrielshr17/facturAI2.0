import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppShell, ProveedorDatos, ProveedorSesion, Acceso, useSesion } from "@sfr/ui";
import { migrate, seed, crearUsuarioRepo, SESION_COPIA_REMOTA, type SqlDriver } from "@sfr/core";
import { crearSqlJsDriver } from "./db/sqljs-driver.js";
import { iniciarSincronizacionEnSegundoPlano } from "./sync/arrancar.js";
import { iniciarCopiaRemota, type ResultadoCopiaRemota } from "./sync/copia-remota.js";
import { MODO_REMOTO } from "./modo-remoto.js";
import "@sfr/ui/estilos-globales.css";

/**
 * Compuerta de sesión (§ RBAC-05): mientras `autenticado` es `false` la app entera
 * es la pantalla de Acceso, no un módulo más — `AppShell` (y con él, `Ventas`, la
 * bitácora, etc.) no se monta hasta que hay una sesión real. Vive DENTRO de
 * `<ProveedorDatos>` porque `<Acceso>` necesita `usuarioRepo.listar()` /
 * `.autenticar()` igual que cualquier pantalla.
 */
function Compuerta({ plataforma }: { plataforma: "Web" | "Escritorio" }) {
  const { autenticado, iniciarSesion } = useSesion();
  useEffect(() => {
    if (MODO_REMOTO && !autenticado) iniciarSesion(SESION_COPIA_REMOTA);
  }, [autenticado, iniciarSesion]);
  if (MODO_REMOTO) return autenticado ? <AppShell plataforma={plataforma} /> : null;
  return autenticado ? <AppShell plataforma={plataforma} /> : <Acceso />;
}

function AvisoCopiaRemota({ motivo }: { motivo: Exclude<ResultadoCopiaRemota, "listo"> }) {
  const mensaje =
    motivo === "sin_sesion"
      ? "Inicia sesión en el panel remoto para abrir facturAI."
      : "Esta copia no está configurada para conectarse a la nube.";
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <p>{mensaje}</p>
      <a href="/">Ir al panel remoto</a>
    </div>
  );
}

/**
 * Arranque de la PWA: inicializa SQLite (sql.js + IndexedDB), aplica migraciones
 * y siembra datos de ejemplo la primera vez. Mientras tanto muestra "Cargando…".
 */
function App() {
  const [db, setDb] = useState<SqlDriver | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avisoRemoto, setAvisoRemoto] = useState<Exclude<ResultadoCopiaRemota, "listo"> | null>(
    null,
  );

  // Guarda contra el doble-montaje de React StrictMode en desarrollo: sin este
  // guard, el efecto crea DOS instancias independientes de sql.js (cada una con
  // su propio estado en memoria); la segunda "gana" y reemplaza silenciosamente
  // a la primera en medio de la sesión, huerfanando cualquier dato ya creado
  // contra la primera (p.ej. un ticket abierto que desaparece al agregar un
  // producto). Con el guard, solo se crea una instancia real.
  const iniciado = useRef(false);
  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    void (async () => {
      try {
        const driver = await crearSqlJsDriver({ exigirLlavesForaneas: !MODO_REMOTO });
        await migrate(driver);
        if (MODO_REMOTO) {
          const resultado = await iniciarCopiaRemota(driver);
          if (resultado !== "listo") {
            setAvisoRemoto(resultado);
            return;
          }
          setDb(driver);
          return;
        }
        await seed(driver);
        setDb(driver);
        // No puede lanzar (arrancar.ts solo loguea y sigue si algo falla): un
        // fallo de sincronización remota jamás debe impedir que la PWA
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
  if (avisoRemoto) return <AvisoCopiaRemota motivo={avisoRemoto} />;
  if (!db) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui", color: "#6b7280" }}>
        Cargando base de datos…
      </div>
    );
  }
  // Re-validación contra la base (criterio de aceptación de RBAC-05): una marca de
  // `sessionStorage` de un usuario que se desactivó o eliminó mientras la pestaña
  // estaba abierta NO se acepta a ciegas. `crearUsuarioRepo(db)` usa el driver CRUDO
  // a propósito: la restauración de sesión ocurre ANTES de que exista cualquier
  // sesión que el guardia de RBAC-04 pudiera exigir.
  async function revalidarUsuarioActivo(usuarioId: string): Promise<boolean> {
    const fila = await crearUsuarioRepo(db!).obtener(usuarioId);
    return fila?.activo === 1;
  }
  return (
    <ProveedorSesion db={db} revalidarUsuarioActivo={revalidarUsuarioActivo}>
      <ProveedorDatos>
        <Compuerta plataforma="Web" />
      </ProveedorDatos>
    </ProveedorSesion>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
