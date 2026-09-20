import { useState, type FormEvent } from "react";
import { supabase } from "../supabaseClient";
import { s, c } from "../estilos";

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
        background: "var(--sfr-overlay)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 100,
      }}
    >
      <div
        style={{
          ...s.tarjeta,
          width: "100%",
          maxWidth: 360,
          boxShadow: "0 4px 16px rgba(15, 23, 42, 0.2)",
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 0, marginBottom: 4 }}>
          Cambiar contraseña
        </h2>

        {exito ? (
          <>
            <p style={{ color: c.gris, fontSize: 14 }}>
              Contraseña actualizada. Úsala la próxima vez que accedas.
            </p>
            <button type="button" onClick={onCerrar} style={{ ...s.boton, width: "100%" }}>
              Cerrar
            </button>
          </>
        ) : (
          <form onSubmit={manejarEnvio}>
            <p style={{ marginTop: 0, marginBottom: 16, color: c.gris, fontSize: 14 }}>
              Escribe la nueva contraseña dos veces.
            </p>

            <label htmlFor="clave-nueva" style={s.label}>
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
              style={{ ...s.input, marginBottom: 12 }}
            />

            <label htmlFor="clave-confirmada" style={s.label}>
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
              style={{ ...s.input, marginBottom: 16 }}
            />

            {error !== null && (
              <div role="alert" style={s.errorBox}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                type="button"
                onClick={onCerrar}
                disabled={enviando}
                style={{
                  ...s.botonSecundario,
                  flex: 1,
                  cursor: enviando ? "not-allowed" : "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={enviando}
                style={{
                  ...s.boton,
                  flex: 1,
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
