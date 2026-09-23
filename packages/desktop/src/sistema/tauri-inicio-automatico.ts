import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import type { AdaptadorInicioAutomatico } from "@sfr/ui";

export const adaptadorInicioAutomaticoTauri: AdaptadorInicioAutomatico = {
  estaActivo: () => isEnabled(),
  activar: () => enable(),
  desactivar: () => disable(),
};
