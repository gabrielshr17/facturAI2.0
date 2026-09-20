import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import { Acceso } from "./pantallas/Acceso";
import { CambiarClave } from "./pantallas/CambiarClave";
import { Inventario } from "./pantallas/Inventario";
import { Compras } from "./pantallas/Compras";
import { Reportes } from "./pantallas/Reportes";

type Pestana = "compras" | "inventario" | "reportes";

const PESTANAS: { id: Pestana; etiqueta: string }[] = [
  { id: "compras", etiqueta: "Compras" },
  { id: "inventario", etiqueta: "Inventario" },
  { id: "reportes", etiqueta: "Reportes" },
];

/**
 * Compuerta de sesión: mientras no hay sesión de Supabase Auth, la app
 * entera es la pantalla de Acceso. `getSession()` resuelve la sesión ya
 * persistida (localStorage, manejado por supabase-js) al montar, y
 * `onAuthStateChange` reacciona a login/logout que ocurran después
 * (incluyendo el refresco automático de token).
 */
export function App(): JSX.Element {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);
  const [pestana, setPestana] = useState<Pestana>("compras");
  const [cambiandoClave, setCambiandoClave] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      setCargandoSesion(false);
    });
    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSesion(nuevaSesion);
    });
    return () => suscripcion.subscription.unsubscribe();
  }, []);

  if (cargandoSesion) {
    return <p style={{ padding: 24 }}>Cargando…</p>;
  }

  if (sesion === null) {
    return <Acceso />;
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          padding: "12px 20px",
          borderBottom: "1px solid var(--sfr-borde)",
          background: "var(--sfr-superficie)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <strong>facturAI · Panel remoto</strong>
          <nav style={{ display: "flex", gap: 4 }}>
            {PESTANAS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPestana(item.id)}
                style={{
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: pestana === item.id ? "var(--sfr-acento)" : "transparent",
                  color: pestana === item.id ? "#fff" : "var(--sfr-texto)",
                }}
              >
                {item.etiqueta}
              </button>
            ))}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: "var(--sfr-gris)" }}>{sesion.user.email}</span>
          <button
            type="button"
            onClick={() => setCambiandoClave(true)}
            style={{
              background: "transparent",
              border: "1px solid var(--sfr-borde)",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cambiar contraseña
          </button>
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            style={{
              background: "transparent",
              border: "1px solid var(--sfr-borde)",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main style={{ flex: 1, padding: 20 }}>
        {pestana === "compras" && <Compras />}
        {pestana === "inventario" && <Inventario />}
        {pestana === "reportes" && <Reportes />}
      </main>

      {cambiandoClave && <CambiarClave onCerrar={() => setCambiandoClave(false)} />}
    </div>
  );
}
