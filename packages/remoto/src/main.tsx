import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { CopiaNoDisponible } from "./pantallas/CopiaNoDisponible";
import "./estilos-globales.css";

const RUTA_COPIA_WEB = "/facturai/index.html";
const enRutaCopiaWeb = window.location.pathname.startsWith("/facturai");

if (enRutaCopiaWeb && window.location.pathname !== RUTA_COPIA_WEB) {
  window.location.replace(RUTA_COPIA_WEB);
} else {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>{enRutaCopiaWeb ? <CopiaNoDisponible /> : <App />}</StrictMode>,
  );
}
