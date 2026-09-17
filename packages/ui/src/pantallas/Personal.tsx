/**
 * Personal.tsx (§ RBAC-07, parte A): pantalla de alta/baja de personal.
 *
 * Antes de esta pantalla la única fila de `usuario` era la semilla del dueño — no había
 * ninguna forma de dar de alta un cajero o supervisor desde la app. Imita el molde de
 * `Clientes.tsx` (tarjeta de formulario inline + tabla con `s.tabla`/`s.th`/`s.td`,
 * confirmaciones con `useAlertas().confirmar()`), pero NO reimplementa ninguna regla de
 * negocio: nombre obligatorio, rol válido, largo del PIN y "no desactivar/degradar al
 * último dueño o superadmin activo" viven en `usuario-repo.ts` y llegan aquí como
 * `ValidacionError`, que solo se atrapa y se muestra.
 *
 * Las excepciones de permiso se editan como una lista de checkboxes sobre `PERMISOS`
 * (catálogo de `dominio/permisos.ts`): el checkbox parte marcado/desmarcado según
 * `permisosDeRol(rol)` (el default del rol elegido) y solo se guarda una clave en
 * `overrides` cuando el valor elegido DIFIERE de ese default — así `permisos_json` sigue
 * siendo, como espera `resolverPermisos`, un `Record<string, boolean>` de EXCEPCIONES
 * puras, nunca la lista completa.
 *
 * No hay repo `activar()`: "reactivar" es la misma llamada a `actualizar()` que edita
 * nombre/rol, con `activo: true` añadido — es la vía que ya expone `usuarioRepo`, no una
 * regla nueva inventada aquí.
 */
import { useEffect, useState } from "react";
import {
  ValidacionError,
  PERMISOS,
  permisosDeRol,
  type Usuario,
  type UsuarioInput,
  type RolUsuario,
  type Permiso,
} from "@sfr/core";
import { UserCog, ShieldCheck, KeyRound } from "lucide-react";
import { useRepos } from "../data/contexto.js";
import { s, c } from "../estilos.js";
import { useAlertas } from "../contexto/Alertas.js";
import { useAtajosTeclado } from "../hooks/useAtajosTeclado.js";

const ROLES: readonly RolUsuario[] = ["cajero", "supervisor", "dueno", "superadmin"];
const ETIQUETA_ROL: Record<RolUsuario, string> = {
  cajero: "Cajero",
  supervisor: "Supervisor",
  dueno: "Dueño",
  superadmin: "Superadmin",
};

interface FormPersonal {
  id: string | null;
  nombre: string;
  rol: RolUsuario;
  pin: string;
  overrides: Partial<Record<Permiso, boolean>>;
}

function overridesDesdeJson(permisosJson: string | null): Partial<Record<Permiso, boolean>> {
  if (!permisosJson) return {};
  try {
    return JSON.parse(permisosJson) as Partial<Record<Permiso, boolean>>;
  } catch {
    return {};
  }
}

function etiquetaPermiso(p: Permiso): string {
  return p.replace(".", " · ");
}

export function Personal() {
  const { usuario: repo } = useRepos();
  const { confirmar, avisar } = useAlertas();
  const [lista, setLista] = useState<Usuario[]>([]);
  const [form, setForm] = useState<FormPersonal | null>(null);
  const [errores, setErrores] = useState<string[]>([]);

  const [reseteando, setReseteando] = useState<Usuario | null>(null);
  const [pinNuevo, setPinNuevo] = useState("");
  const [erroresPin, setErroresPin] = useState<string[]>([]);

  useAtajosTeclado({
    F6: () => nuevo(),
    "Ctrl+S": () => { if (form) void guardar(); },
    Escape: () => {
      if (reseteando) setReseteando(null);
      else if (form) setForm(null);
    },
  });

  async function recargar() {
    setLista(await repo.listar());
  }
  useEffect(() => {
    void recargar();
  }, []);

  function nuevo() {
    setForm({ id: null, nombre: "", rol: "cajero", pin: "", overrides: {} });
    setErrores([]);
  }

  function editar(u: Usuario) {
    setForm({ id: u.id, nombre: u.nombre, rol: u.rol, pin: "", overrides: overridesDesdeJson(u.permisos_json) });
    setErrores([]);
  }

  function alternarPermiso(p: Permiso) {
    if (!form) return;
    const defecto = permisosDeRol(form.rol).has(p);
    const actual = form.overrides[p] ?? defecto;
    const siguiente = !actual;
    const overrides = { ...form.overrides };
    if (siguiente === defecto) delete overrides[p];
    else overrides[p] = siguiente;
    setForm({ ...form, overrides });
  }

  async function guardar() {
    if (!form) return;
    const permisos_json = Object.keys(form.overrides).length ? JSON.stringify(form.overrides) : null;
    try {
      if (form.id === null) {
        const input: UsuarioInput = { nombre: form.nombre, rol: form.rol, pin: form.pin, permisos_json };
        await repo.crear(input);
      } else {
        const input: UsuarioInput = { nombre: form.nombre, rol: form.rol, permisos_json };
        await repo.actualizar(form.id, input);
      }
      setForm(null);
      await recargar();
    } catch (e) {
      if (e instanceof ValidacionError) setErrores(e.errores.map((x) => x.mensaje));
      else setErrores([String(e)]);
    }
  }

  async function alternarActivo(u: Usuario) {
    try {
      if (u.activo === 1) {
        if (!(await confirmar(`¿Desactivar a "${u.nombre}"?`, { textoConfirmar: "Desactivar" }))) return;
        await repo.desactivar(u.id);
      } else {
        const input: UsuarioInput = { nombre: u.nombre, rol: u.rol, activo: true, permisos_json: u.permisos_json };
        await repo.actualizar(u.id, input);
      }
      await recargar();
    } catch (e) {
      const mensaje = e instanceof ValidacionError ? e.errores.map((x) => x.mensaje).join(" ") : String(e);
      await avisar(mensaje, { variante: "error" });
    }
  }

  function abrirReseteo(u: Usuario) {
    setReseteando(u);
    setPinNuevo("");
    setErroresPin([]);
  }

  async function confirmarReseteo() {
    if (!reseteando) return;
    try {
      await repo.cambiarPin({ usuarioId: reseteando.id, pinNuevo, omitirPinActual: true });
      const nombre = reseteando.nombre;
      setReseteando(null);
      await avisar(`PIN de "${nombre}" actualizado.`, { variante: "info" });
    } catch (e) {
      if (e instanceof ValidacionError) setErroresPin(e.errores.map((x) => x.mensaje));
      else setErroresPin([String(e)]);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <button style={s.boton} onClick={nuevo}>+ Nuevo usuario (F6)</button>
        <span style={{ color: c.gris, fontSize: 13 }}>{lista.length} usuario(s)</span>
      </div>

      {form && (
        <div style={{ ...s.tarjeta, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <UserCog size={18} /> {form.id === null ? "Nuevo usuario" : "Editar usuario"}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={s.label}>Nombre *</label>
              <input
                autoFocus
                aria-label="Nombre"
                style={s.input}
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </div>
            <div>
              <label style={s.label}>Rol *</label>
              <select
                aria-label="Rol"
                style={s.input}
                value={form.rol}
                onChange={(e) => setForm({ ...form, rol: e.target.value as RolUsuario })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>
                ))}
              </select>
            </div>
            {form.id === null && (
              <div>
                <label style={s.label}>PIN inicial *</label>
                <input
                  aria-label="PIN inicial"
                  style={s.input}
                  inputMode="numeric"
                  maxLength={6}
                  value={form.pin}
                  onChange={(e) => setForm({ ...form, pin: e.target.value })}
                  placeholder="4 a 6 dígitos"
                />
              </div>
            )}
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={{ ...s.label, display: "flex", alignItems: "center", gap: 6, marginTop: 0 }}>
              <ShieldCheck size={15} /> Permisos ({ETIQUETA_ROL[form.rol]} por defecto, marca para dar una excepción)
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
              {PERMISOS.map((p) => {
                const defecto = permisosDeRol(form.rol).has(p);
                const esExcepcion = p in form.overrides;
                const efectivo = form.overrides[p] ?? defecto;
                return (
                  <label key={p} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, padding: "3px 0" }}>
                    <input type="checkbox" checked={efectivo} onChange={() => alternarPermiso(p)} />
                    <span>{etiquetaPermiso(p)}</span>
                    {esExcepcion && (
                      <span style={{ ...s.badge, background: efectivo ? c.verdeFondo : c.rojoFondo, color: efectivo ? c.verde : c.rojo }}>
                        {efectivo ? "concedido" : "quitado"}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          {errores.length > 0 && <div role="alert" style={s.errorBox}>{errores.join(" ")}</div>}

          <div style={s.formFooter}>
            <button style={s.boton} onClick={guardar}>Guardar (Ctrl+S)</button>
            <button style={s.botonSecundario} onClick={() => setForm(null)}>Cancelar (Esc)</button>
          </div>
        </div>
      )}

      {reseteando && (
        <div style={{ ...s.tarjeta, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <KeyRound size={18} /> Resetear PIN de "{reseteando.nombre}"
          </h3>
          <label style={s.label}>PIN nuevo *</label>
          <input
            autoFocus
            aria-label="PIN nuevo"
            style={s.input}
            inputMode="numeric"
            maxLength={6}
            value={pinNuevo}
            onChange={(e) => setPinNuevo(e.target.value)}
            placeholder="4 a 6 dígitos"
          />
          {erroresPin.length > 0 && <div role="alert" style={s.errorBox}>{erroresPin.join(" ")}</div>}
          <div style={s.formFooter}>
            <button style={s.boton} onClick={confirmarReseteo}>Guardar PIN</button>
            <button style={s.botonSecundario} onClick={() => setReseteando(null)}>Cancelar (Esc)</button>
          </div>
        </div>
      )}

      <div style={s.tarjeta}>
        <div className="sfr-tabla-scroll">
          <table style={s.tabla}>
            <thead>
              <tr>
                <th scope="col" style={s.th}>Nombre</th>
                <th scope="col" style={s.th}>Rol</th>
                <th scope="col" style={s.th}>Estado</th>
                <th scope="col" style={s.th}>Excepciones</th>
                <th scope="col" style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 && (
                <tr><td style={s.filaVacia} colSpan={5}>Sin personal. Crea el primero con "+ Nuevo usuario".</td></tr>
              )}
              {lista.map((u) => {
                const nExcepciones = Object.keys(overridesDesdeJson(u.permisos_json)).length;
                return (
                  <tr key={u.id}>
                    <td style={s.td}>{u.nombre}</td>
                    <td style={s.td}>{ETIQUETA_ROL[u.rol]}</td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, background: u.activo === 1 ? c.verdeFondo : c.grisClaro, color: u.activo === 1 ? c.verde : c.gris }}>
                        {u.activo === 1 ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td style={s.td}>{nExcepciones > 0 ? `${nExcepciones} excepción(es)` : "—"}</td>
                    <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                      <button style={s.botonSecundario} onClick={() => editar(u)}>Editar</button>{" "}
                      <button style={s.botonSecundario} onClick={() => abrirReseteo(u)}>Resetear PIN</button>{" "}
                      <button
                        className={u.activo === 1 ? "sfr-peligro" : undefined}
                        style={u.activo === 1 ? s.botonPeligro : s.botonSecundario}
                        onClick={() => alternarActivo(u)}
                      >
                        {u.activo === 1 ? "Desactivar" : "Activar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
