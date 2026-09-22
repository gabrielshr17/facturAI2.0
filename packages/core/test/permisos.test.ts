import { describe, it, expect } from "vitest";
import {
  PERMISOS,
  permisosDeRol,
  resolverPermisos,
  modulosPermitidos,
  puedeVerBackoffice,
} from "../src/dominio/permisos.js";

describe("permisosDeRol — defaults por rol", () => {
  it("cajero solo opera Ventas y cobrar, sin edición de catálogo ni ganancia", () => {
    const p = permisosDeRol("cajero");
    expect(p.has("modulo.ventas")).toBe(true);
    expect(p.has("factura.cobrar")).toBe(true);
    expect(p.has("producto.editar")).toBe(false);
    expect(p.has("factura.eliminar")).toBe(false);
    expect(p.has("reporte.ganancia")).toBe(false);
  });

  it("cajero puede abrir su propio turno de caja pero no cerrar el de otro (caja.cerrar es de supervisor+)", () => {
    const p = permisosDeRol("cajero");
    expect(p.has("caja.abrir")).toBe(true);
    expect(p.has("caja.cerrar")).toBe(false);
  });

  it("supervisor es superconjunto estricto de cajero, con compras y cuadre de caja", () => {
    const cajero = permisosDeRol("cajero");
    const supervisor = permisosDeRol("supervisor");
    for (const permiso of cajero) expect(supervisor.has(permiso)).toBe(true);
    expect(supervisor.size).toBeGreaterThan(cajero.size);
    expect(supervisor.has("compra.registrar")).toBe(true);
    expect(supervisor.has("caja.cerrar")).toBe(true);
  });

  it("dueno es superconjunto estricto de supervisor e incluye personal.gestionar", () => {
    const supervisor = permisosDeRol("supervisor");
    const dueno = permisosDeRol("dueno");
    for (const permiso of supervisor) expect(dueno.has(permiso)).toBe(true);
    expect(dueno.size).toBeGreaterThan(supervisor.size);
    expect(dueno.has("personal.gestionar")).toBe(true);
  });

  it("superadmin tiene absolutamente todos los permisos del catálogo", () => {
    const superadmin = permisosDeRol("superadmin");
    for (const permiso of PERMISOS) expect(superadmin.has(permiso)).toBe(true);
    expect(superadmin.size).toBe(PERMISOS.length);
  });
});

describe("resolverPermisos — excepciones por usuario sobre el default del rol", () => {
  it("un permiso concedido de más en el JSON se suma sin quitar nada del rol", () => {
    const base = permisosDeRol("cajero");
    const resuelto = resolverPermisos({
      rol: "cajero",
      permisos_json: JSON.stringify({ "producto.editar": true }),
    });
    expect(resuelto.has("producto.editar")).toBe(true);
    for (const permiso of base) expect(resuelto.has(permiso)).toBe(true);
    expect(resuelto.size).toBe(base.size + 1);
  });

  it("un permiso puesto en false quita ese permiso propio del rol", () => {
    const resuelto = resolverPermisos({
      rol: "supervisor",
      permisos_json: JSON.stringify({ "compra.registrar": false }),
    });
    expect(resuelto.has("compra.registrar")).toBe(false);
    expect(resuelto.has("modulo.ventas")).toBe(true);
  });

  it("ignora claves del JSON que no correspondan a ningún permiso válido", () => {
    const base = permisosDeRol("cajero");
    const resuelto = resolverPermisos({
      rol: "cajero",
      permisos_json: JSON.stringify({ "permiso.inexistente": true }),
    });
    expect(resuelto.size).toBe(base.size);
  });

  it("permisos_json null no aplica ninguna excepción", () => {
    const base = permisosDeRol("dueno");
    const resuelto = resolverPermisos({ rol: "dueno", permisos_json: null });
    expect(resuelto).toEqual(base);
  });

  it("JSON malformado devuelve los permisos del rol y avisa por el callback, sin lanzar", () => {
    const base = permisosDeRol("cajero");
    let mensaje: string | undefined;
    const resuelto = resolverPermisos({ rol: "cajero", permisos_json: "{esto no es json" }, (m) => {
      mensaje = m;
    });
    expect(resuelto).toEqual(base);
    expect(mensaje).toBeTruthy();
  });

  it("JSON malformado sin callback no lanza y devuelve los permisos del rol", () => {
    expect(() => resolverPermisos({ rol: "cajero", permisos_json: "no-es-json" })).not.toThrow();
  });
});

describe("modulosPermitidos — visibilidad de módulos de AppShell", () => {
  it("un cajero solo ve el módulo Ventas", () => {
    const modulos = modulosPermitidos(permisosDeRol("cajero"));
    expect(modulos).toEqual(["Ventas"]);
  });

  it("un dueño ve prácticamente todos los módulos", () => {
    const modulos = modulosPermitidos(permisosDeRol("dueno"));
    expect(modulos).toContain("Ventas");
    expect(modulos).toContain("Reportes");
    expect(modulos).toContain("Configuración");
  });
});

describe("puedeVerBackoffice — asimetría documentada en la cabecera del archivo", () => {
  it("es falso para un cajero", () => {
    expect(puedeVerBackoffice(permisosDeRol("cajero"))).toBe(false);
  });

  it("es verdadero para un dueño y para un superadmin", () => {
    expect(puedeVerBackoffice(permisosDeRol("dueno"))).toBe(true);
    expect(puedeVerBackoffice(permisosDeRol("superadmin"))).toBe(true);
  });
});
