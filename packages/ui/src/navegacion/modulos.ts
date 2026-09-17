/**
 * Registro declarativo de módulos (§ PLATAFORMA-07, ola 2).
 *
 * Antes, `AppShell.tsx` cableaba los nueve módulos en CUATRO lugares del mismo archivo
 * (unión de tipos, arreglo `MODULOS`, `record` de iconos y una cadena de nueve renders)
 * y el atajo Alt+N salía del ÍNDICE del arreglo. Ese techo ya deformó el producto:
 * `pantallas/ConsultaFacturas.tsx` documenta que las cotizaciones se volvieron pestaña
 * interna "para no sumar un décimo ítem que rompería Alt+1..9". Con este registro, el
 * atajo es un DATO fijo por módulo — nunca el índice — y admite `atajo: null`, que es
 * como entran el décimo módulo y siguientes sin inventar un 'Alt+10' que
 * `useAtajosTeclado`/`normalizarTecla` nunca produce.
 *
 * `permiso` usa el catálogo único de RBAC-02 (`@sfr/core` reexporta `dominio/permisos.js`).
 * Cada uno de los nueve permisos `modulo.*` ya existe en ese archivo con exactamente esta
 * correspondencia — no se inventó ninguno nuevo aquí.
 */
import type { ComponentType } from "react";
import {
  ShoppingCart, Package, Users, Receipt, Truck,
  Banknote, ChartColumn, Tag, Settings, ScrollText, type LucideProps,
} from "lucide-react";
import type { Permiso } from "@sfr/core";
import { Ventas } from "../pantallas/Ventas.js";
import { Productos } from "../pantallas/Productos.js";
import { Clientes } from "../pantallas/Clientes.js";
import { ConsultaFacturas } from "../pantallas/ConsultaFacturas.js";
import { Compras } from "../pantallas/Compras.js";
import { CorteCaja } from "../pantallas/CorteCaja.js";
import { Reportes } from "../pantallas/Reportes.js";
import { Promociones } from "../pantallas/Promociones.js";
import { Configuracion } from "../pantallas/Configuracion.js";
import { Auditoria } from "../pantallas/Auditoria.js";

export interface ModuloDef {
  id: string;
  etiqueta: string;
  icono: ComponentType<LucideProps>;
  /** Fijo por módulo, nunca calculado por posición. `null` = sin atajo de teclado. */
  atajo: string | null;
  /** `null` = visible para cualquier sesión (ningún permiso lo condiciona). */
  permiso: Permiso | null;
  componente: ComponentType;
}

export const MODULOS: ModuloDef[] = [
  { id: "ventas", etiqueta: "Ventas", icono: ShoppingCart, atajo: "Alt+1", permiso: "modulo.ventas", componente: Ventas },
  { id: "productos", etiqueta: "Productos", icono: Package, atajo: "Alt+2", permiso: "modulo.productos", componente: Productos },
  { id: "clientes", etiqueta: "Clientes", icono: Users, atajo: "Alt+3", permiso: "modulo.clientes", componente: Clientes },
  { id: "facturas", etiqueta: "Facturas", icono: Receipt, atajo: "Alt+4", permiso: "modulo.facturas", componente: ConsultaFacturas },
  { id: "compras", etiqueta: "Compras", icono: Truck, atajo: "Alt+5", permiso: "modulo.compras", componente: Compras },
  { id: "corte_caja", etiqueta: "Corte de caja", icono: Banknote, atajo: "Alt+6", permiso: "modulo.corte_caja", componente: CorteCaja },
  { id: "reportes", etiqueta: "Reportes", icono: ChartColumn, atajo: "Alt+7", permiso: "modulo.reportes", componente: Reportes },
  { id: "promociones", etiqueta: "Promociones", icono: Tag, atajo: "Alt+8", permiso: "modulo.promociones", componente: Promociones },
  { id: "configuracion", etiqueta: "Configuración", icono: Settings, atajo: "Alt+9", permiso: "modulo.configuracion", componente: Configuracion },
  // Décimo módulo: sin atajo (no hay 'Alt+10') y sin permiso propio todavía — el catálogo
  // de RBAC-02 no tiene un permiso de auditoría, así que queda visible para cualquier
  // sesión por ahora, igual que cuando vivía sin permiso dentro de Configuración. Cuando
  // exista un rol con visibilidad restringida de verdad, esto necesita su propio permiso.
  { id: "auditoria", etiqueta: "Auditoría", icono: ScrollText, atajo: null, permiso: null, componente: Auditoria },
];

export const MODULO_POR_DEFECTO_ID = "ventas";
