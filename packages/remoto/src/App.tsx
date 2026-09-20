import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import { c, s } from "./estilos";
import { Acceso } from "./pantallas/Acceso";
import { CambiarClave } from "./pantallas/CambiarClave";
import { Inventario } from "./pantallas/Inventario";
import { Compras } from "./pantallas/Compras";
import { Reportes } from "./pantallas/Reportes";
import { Ventas } from "./pantallas/Ventas";
import { Clientes } from "./pantallas/Clientes";
import { Productos } from "./pantallas/Productos";
import { Promociones } from "./pantallas/Promociones";
import { ConsultaCotizaciones } from "./pantallas/ConsultaCotizaciones";
import { ConsultaFacturas } from "./pantallas/ConsultaFacturas";
import { Personal } from "./pantallas/Personal";
import { Configuracion } from "./pantallas/Configuracion";

type Pestana =
  | "ventas"
  | "clientes"
  | "productos"
  | "compras"
  | "inventario"
  | "promociones"
  | "cotizaciones"
  | "facturas"
  | "reportes"
  | "personal"
  | "configuracion";

const PESTANAS: { id: Pestana; etiqueta: string }[] = [
  { id: "ventas", etiqueta: "Ventas" },
  { id: "clientes", etiqueta: "Clientes" },
  { id: "productos", etiqueta: "Productos" },
  { id: "compras", etiqueta: "Compras" },
  { id: "inventario", etiqueta: "Inventario" },
  { id: "promociones", etiqueta: "Promociones" },
  { id: "cotizaciones", etiqueta: "Cotizaciones" },
  { id: "facturas", etiqueta: "Facturas" },
  { id: "reportes", etiqueta: "Reportes" },
  { id: "personal", etiqueta: "Personal" },
  { id: "configuracion", etiqueta: "Configuración" },
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
  const [pestana, setPestana] = useState<Pestana>("ventas");
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
    return <p style={{ padding: 24, color: c.gris }}>Cargando…</p>;
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
          borderBottom: `1px solid ${c.borde}`,
          background: c.superficie,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 15, letterSpacing: -0.2 }}>facturAI · Panel remoto</strong>
          <nav style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
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
                  background: pestana === item.id ? c.azul : "transparent",
                  color: pestana === item.id ? "#fff" : c.texto,
                }}
              >
                {item.etiqueta}
              </button>
            ))}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: c.gris }}>{sesion.user.email}</span>
          <button type="button" onClick={() => setCambiandoClave(true)} style={s.botonSecundario}>
            Cambiar contraseña
          </button>
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            style={s.botonSecundario}
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main style={{ flex: 1, padding: 20 }}>
        {pestana === "ventas" && <Ventas />}
        {pestana === "clientes" && <Clientes />}
        {pestana === "productos" && <Productos />}
        {pestana === "compras" && <Compras />}
        {pestana === "inventario" && <Inventario />}
        {pestana === "promociones" && <Promociones />}
        {pestana === "cotizaciones" && <ConsultaCotizaciones />}
        {pestana === "facturas" && <ConsultaFacturas />}
        {pestana === "reportes" && <Reportes />}
        {pestana === "personal" && <Personal />}
        {pestana === "configuracion" && <Configuracion />}
      </main>

      {cambiandoClave && <CambiarClave onCerrar={() => setCambiandoClave(false)} />}
    </div>
  );
}
