import { useState, type FormEvent } from "react";
import { supabase } from "../supabaseClient";

/**
 * Login por correo/contraseña contra Supabase Auth. No hay validación propia
 * de formato ni de fuerza de contraseña: el mensaje de error que se muestra
 * es el que devuelve Supabase tal cual (credenciales inválidas, usuario no
 * confirmado, etc.), porque la única fuente de verdad sobre si una
 * credencial es válida es Auth, no una regla inventada acá.
 */
export function Acceso(): JSX.Element {
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    const { error: errorSupabase } = await supabase.auth.signInWithPassword({
      email: correo,
      password: clave,
    });
    setEnviando(false);
    if (errorSupabase) {
      setError(errorSupabase.message);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <form
        onSubmit={manejarEnvio}
        style={{
          width: "100%",
          maxWidth: 360,
          background: "var(--sfr-superficie)",
          border: "1px solid var(--sfr-borde)",
          borderRadius: 12,
          padding: 24,
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.1)",
        }}
      >
        <h1 style={{ fontSize: 20, marginTop: 0, marginBottom: 4 }}>facturAI</h1>
        <p style={{ marginTop: 0, marginBottom: 20, color: "var(--sfr-gris)", fontSize: 14 }}>
          Panel remoto del dueño
        </p>

        <label
          htmlFor="correo"
          style={{ display: "block", fontSize: 13, color: "var(--sfr-gris)", marginBottom: 4 }}
        >
          Correo
        </label>
        <input
          id="correo"
          type="email"
          autoComplete="username"
          required
          value={correo}
          onChange={(evento) => setCorreo(evento.target.value)}
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
          htmlFor="clave"
          style={{ display: "block", fontSize: 13, color: "var(--sfr-gris)", marginBottom: 4 }}
        >
          Contraseña
        </label>
        <input
          id="clave"
          type="password"
          autoComplete="current-password"
          required
          value={clave}
          onChange={(evento) => setClave(evento.target.value)}
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

        <button
          type="submit"
          disabled={enviando}
          style={{
            width: "100%",
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
          {enviando ? "Accediendo…" : "Acceder"}
        </button>
      </form>
    </div>
  );
}
