import { useState, type FormEvent } from "react";
import { supabase } from "../supabaseClient";

/**
 * Actualiza la contraseña de la sesión activa. `updateUser` no exige la
 * contraseña actual (ya hay una sesión válida de Supabase Auth), así que la
 * única validación propia es que la nueva contraseña se escriba dos veces
 * igual antes de enviarla.
 */
export function CambiarClave({ onCerrar }: { onCerrar: () => void }): JSX.Element {
  const [claveNueva, setClaveNueva] = useState("");
  const [claveConfirmada, setClaveConfirmada] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);
    if (claveNueva !== claveConfirmada) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (claveNueva.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setEnviando(true);
    const { error: errorSupabase } = await supabase.auth.updateUser({ password: claveNueva });
    setEnviando(false);
    if (errorSupabase) {
      setError(errorSupabase.message);
      return;
    }
    setExito(true);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 100,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          background: "var(--sfr-superficie)",
          border: "1px solid var(--sfr-borde)",
          borderRadius: 12,
          padding: 24,
          boxShadow: "0 4px 16px rgba(15, 23, 42, 0.2)",
        }}
      >
        <h2 style={{ fontSize: 18, marginTop: 0, marginBottom: 4 }}>Cambiar contraseña</h2>

        {exito ? (
          <>
            <p style={{ color: "var(--sfr-gris)", fontSize: 14 }}>
              Contraseña actualizada. Úsala la próxima vez que accedas.
            </p>
            <button
              type="button"
              onClick={onCerrar}
              style={{
                width: "100%",
                background: "var(--sfr-acento)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 16px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cerrar
            </button>
          </>
        ) : (
          <form onSubmit={manejarEnvio}>
            <p style={{ marginTop: 0, marginBottom: 16, color: "var(--sfr-gris)", fontSize: 14 }}>
              Escribe la nueva contraseña dos veces.
            </p>

            <label
              htmlFor="clave-nueva"
              style={{ display: "block", fontSize: 13, color: "var(--sfr-gris)", marginBottom: 4 }}
            >
              Contraseña nueva
            </label>
            <input
              id="clave-nueva"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={claveNueva}
              onChange={(evento) => setClaveNueva(evento.target.value)}
              style={{
                width: "100%",
                padding: "9px 12px",
                fontSize: 14,
                border: "1px solid var(--sfr-borde)",
                borderRadius: 8,
                marginBottom: 12,
                background: "var(--sfr-superficie)",
              }}
            />

            <label
              htmlFor="clave-confirmada"
              style={{ display: "block", fontSize: 13, color: "var(--sfr-gris)", marginBottom: 4 }}
            >
              Confirmar contraseña nueva
            </label>
            <input
              id="clave-confirmada"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={claveConfirmada}
              onChange={(evento) => setClaveConfirmada(evento.target.value)}
              style={{
                width: "100%",
                padding: "9px 12px",
                fontSize: 14,
                border: "1px solid var(--sfr-borde)",
                borderRadius: 8,
                marginBottom: 16,
                background: "var(--sfr-superficie)",
              }}
            />

            {error !== null && (
              <div
                role="alert"
                style={{
                  background: "var(--sfr-peligro-fondo)",
                  color: "var(--sfr-peligro)",
                  border: "1px solid var(--sfr-peligro)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={onCerrar}
                disabled={enviando}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "1px solid var(--sfr-borde)",
                  borderRadius: 8,
                  padding: "10px 16px",
                  fontSize: 14,
                  cursor: enviando ? "not-allowed" : "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={enviando}
                style={{
                  flex: 1,
                  background: "var(--sfr-acento)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: enviando ? "not-allowed" : "pointer",
                  opacity: enviando ? 0.7 : 1,
                }}
              >
                {enviando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
