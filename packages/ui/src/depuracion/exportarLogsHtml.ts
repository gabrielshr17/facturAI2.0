import { describirLogDev, type LogDevEntry } from "@sfr/core";

const COLOR_NIVEL: Record<LogDevEntry["nivel"], { fondo: string; texto: string; etiqueta: string }> = {
  error: { fondo: "#fee2e2", texto: "#b91c1c", etiqueta: "Error" },
  warn: { fondo: "#fef3c7", texto: "#92400e", etiqueta: "Advertencia" },
};

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function tarjetaLog(log: LogDevEntry): string {
  const color = COLOR_NIVEL[log.nivel];
  const fecha = new Date(log.timestamp).toLocaleString("es-DO");
  const detalleCompleto = log.detalle ? `${log.mensaje}\n\n${log.detalle}` : log.mensaje;
  return `
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="background:${color.fondo};color:${color.texto};font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;">${color.etiqueta}</span>
          <span style="color:#6b7280;font-size:12px;">${escaparHtml(fecha)}</span>
        </div>
        <p style="margin:0 0 6px 0;font-size:14px;color:#111827;">${escaparHtml(describirLogDev(log))}</p>
        <details>
          <summary style="cursor:pointer;color:#6b7280;font-size:12px;">Detalle técnico</summary>
          <pre style="white-space:pre-wrap;font-size:12px;color:#374151;background:#f9fafb;padding:8px;border-radius:6px;margin-top:6px;">${escaparHtml(detalleCompleto)}</pre>
        </details>
      </div>`;
}

/** Genera el HTML autocontenido del reporte de depuración, más reciente primero. */
export function generarHtmlLogsDev(logs: LogDevEntry[]): string {
  const filas = [...logs].reverse().map(tarjetaLog).join("\n");
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Registro de depuración — facturAI</title>
</head>
<body style="font-family: system-ui, sans-serif; background:#f3f4f6; margin:0; padding:24px;">
  <div style="max-width:720px;margin:0 auto;">
    <h1 style="font-size:20px;margin-bottom:4px;">Registro de depuración</h1>
    <p style="color:#6b7280;font-size:13px;margin-top:0;">Generado el ${escaparHtml(new Date().toLocaleString("es-DO"))} — ${logs.length} entrada(s).</p>
    ${logs.length === 0 ? '<p style="color:#6b7280;">Sin errores ni advertencias registrados.</p>' : filas}
  </div>
</body>
</html>`;
}
