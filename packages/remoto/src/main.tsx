import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { CopiaNoDisponible } from "./pantallas/CopiaNoDisponible";
import "./estilos-globales.css";

const RUTA_COPIA_WEB = "/facturai/index.html";
const CLAVE_REINTENTO = "sfr-copia-reintento";
const enRutaCopiaWeb = window.location.pathname.startsWith("/facturai");

function yaReintento(): boolean {
  try {
    return sessionStorage.getItem(CLAVE_REINTENTO) === "1";
  } catch {
    return true;
  }
}

function marcarReintento(): void {
  try {
    sessionStorage.setItem(CLAVE_REINTENTO, "1");
  } catch {
    return;
  }
}

async function limpiarServiceWorkersYCaches(): Promise<void> {
  const registros = (await navigator.serviceWorker?.getRegistrations()) ?? [];
  await Promise.all(registros.map((registro) => registro.unregister()));
  const nombres = (await window.caches?.keys()) ?? [];
  await Promise.all(nombres.map((nombre) => window.caches.delete(nombre)));
}

function montar(pantalla: JSX.Element): void {
  createRoot(document.getElementById("root")!).render(<StrictMode>{pantalla}</StrictMode>);
}

if (!enRutaCopiaWeb) {
  montar(<App />);
} else if (window.location.pathname !== RUTA_COPIA_WEB) {
  window.location.replace(RUTA_COPIA_WEB);
} else if (yaReintento()) {
  montar(<CopiaNoDisponible />);
} else {
  marcarReintento();
  limpiarServiceWorkersYCaches()
    .then(() => window.location.replace(`${RUTA_COPIA_WEB}?r=${Date.now()}`))
    .catch((error: unknown) => {
      console.error("No se pudo limpiar el service worker antes de reintentar:", error);
      montar(<CopiaNoDisponible />);
    });
}
