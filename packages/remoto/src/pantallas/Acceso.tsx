import { useState, type FormEvent } from "react";
import { supabase } from "../supabaseClient";
import { s, c } from "../estilos";

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
      <form onSubmit={manejarEnvio} style={{ ...s.tarjeta, width: "100%", maxWidth: 360 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: -0.3,
            marginTop: 0,
            marginBottom: 4,
          }}
        >
          facturAI
        </h1>
        <p style={{ marginTop: 0, marginBottom: 20, color: c.gris, fontSize: 14 }}>
          Panel remoto del dueño
        </p>

        <label htmlFor="correo" style={s.label}>
          Correo
        </label>
        <input
          id="correo"
          type="email"
          autoComplete="username"
          required
          value={correo}
          onChange={(evento) => setCorreo(evento.target.value)}
          style={{ ...s.input, marginBottom: 12 }}
        />

        <label htmlFor="clave" style={s.label}>
          Contraseña
        </label>
        <input
          id="clave"
          type="password"
          autoComplete="current-password"
          required
          value={clave}
          onChange={(evento) => setClave(evento.target.value)}
          style={{ ...s.input, marginBottom: 16 }}
        />

        {error !== null && (
          <div role="alert" style={s.errorBox}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={enviando}
          style={{
            ...s.boton,
            width: "100%",
            marginTop: 16,
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
