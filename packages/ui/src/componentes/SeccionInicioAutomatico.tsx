import { useEffect, useState } from "react";
import { Power } from "lucide-react";
import { s, c } from "../estilos.js";
import { obtenerAdaptadorInicioAutomatico } from "../sistema/inicio-automatico.js";

type Estado = "cargando" | "listo" | "no-disponible";

export function SeccionInicioAutomatico() {
  const adaptador = obtenerAdaptadorInicioAutomatico();
  const [estado, setEstado] = useState<Estado>("cargando");
  const [activo, setActivo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!adaptador) return;
    let vigente = true;
    adaptador
      .estaActivo()
      .then((valor) => {
        if (!vigente) return;
        setActivo(valor);
        setEstado("listo");
      })
      .catch((e: unknown) => {
        console.error("No se pudo leer el inicio automático con Windows", e);
        if (vigente) setEstado("no-disponible");
      });
    return () => {
      vigente = false;
    };
  }, [adaptador]);

  if (!adaptador) return null;

  async function cambiar(nuevoValor: boolean) {
    if (!adaptador) return;
    setGuardando(true);
    setError(null);
    try {
      if (nuevoValor) await adaptador.activar();
      else await adaptador.desactivar();
      setActivo(nuevoValor);
    } catch (e) {
      console.error("No se pudo cambiar el inicio automático con Windows", e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div style={{ ...s.tarjeta, marginTop: 16 }}>
      <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <Power size={18} /> Inicio con Windows
      </h3>
      {estado === "no-disponible" ? (
        <p style={{ color: c.gris, fontSize: 13 }}>
          El inicio con Windows no está disponible en esta instalación.
        </p>
      ) : (
        <>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              minHeight: 44,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={activo}
              disabled={estado === "cargando" || guardando}
              onChange={(e) => void cambiar(e.target.checked)}
              style={{ width: 20, height: 20 }}
            />
            Iniciar facturAI al encender Windows
          </label>
          <p style={{ color: c.gris, fontSize: 13, marginBottom: 0 }}>
            La app abre sola al encender el equipo y pide el acceso de siempre.
          </p>
        </>
      )}
      {error && <div style={{ ...s.errorBox, marginTop: 12 }}>{error}</div>}
    </div>
  );
}
