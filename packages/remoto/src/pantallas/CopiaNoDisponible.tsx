import { c } from "../estilos";

export function CopiaNoDisponible(): JSX.Element {
  return (
    <div style={{ padding: 24, maxWidth: 560 }}>
      <h2 style={{ marginTop: 0 }}>La app facturAI no está disponible en este servidor</h2>
      <p style={{ color: c.gris }}>
        Falta la copia web. Ejecuta <code>pnpm --filter @sfr/web build:remoto</code>, reinicia el
        servidor del panel y vuelve a pulsar facturAI.
      </p>
      <a href="/">Volver al panel</a>
    </div>
  );
}
