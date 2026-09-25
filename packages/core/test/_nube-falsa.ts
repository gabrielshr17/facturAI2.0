export type FilaRemota = Record<string, unknown>;

const MAX_FILAS_NUBE = 1000;

export interface NubeFalsa {
  tablas: Record<string, FilaRemota[]>;
  consultas: URL[];
  subidas: { tabla: string; filas: FilaRemota[] }[];
  autenticaciones: { total: number };
  autorizaciones: string[];
  tablasConError: Set<string>;
  fetch: typeof fetch;
}

export function crearNubeFalsa(): NubeFalsa {
  const tablas: Record<string, FilaRemota[]> = {};
  const consultas: URL[] = [];
  const subidas: { tabla: string; filas: FilaRemota[] }[] = [];
  const tablasConError = new Set<string>();
  const autenticaciones = { total: 0 };
  const autorizaciones: string[] = [];
  const fetchFalso = (async (entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(entrada));
    if (url.pathname === "/auth/v1/token") {
      autenticaciones.total += 1;
      return new Response(JSON.stringify({ access_token: "token-de-prueba" }), { status: 200 });
    }
    const tabla = url.pathname.replace("/rest/v1/", "");
    if (init?.method === "POST") {
      subidas.push({ tabla, filas: JSON.parse(String(init.body)) as FilaRemota[] });
      return new Response(null, { status: 201 });
    }
    consultas.push(url);
    autorizaciones.push(
      String((init?.headers as Record<string, string> | undefined)?.Authorization),
    );
    if (tablasConError.has(tabla)) return new Response("boom", { status: 500 });
    const campo = url.searchParams.get("order")?.startsWith("timestamp")
      ? "timestamp"
      : "updated_at";
    const filtro = url.searchParams.get(campo);
    const desde = filtro?.startsWith("gte.") ? new Date(filtro.slice(4)).getTime() : -Infinity;
    const filas = (tablas[tabla] ?? [])
      .filter((f) => new Date(String(f[campo])).getTime() >= desde)
      .sort(
        (a, b) =>
          String(a[campo]).localeCompare(String(b[campo])) ||
          String(a.id).localeCompare(String(b.id)),
      );
    const limite = Number(url.searchParams.get("limit") ?? Infinity);
    const desplazamiento = Number(url.searchParams.get("offset") ?? 0);
    const pagina = filas.slice(desplazamiento, desplazamiento + Math.min(limite, MAX_FILAS_NUBE));
    return new Response(JSON.stringify(pagina), { status: 200 });
  }) as typeof fetch;
  return {
    tablas,
    consultas,
    subidas,
    autenticaciones,
    autorizaciones,
    tablasConError,
    fetch: fetchFalso,
  };
}

export const CONFIG = {
  supabaseUrl: "https://ejemplo.supabase.co",
  supabaseAnonKey: "anon",
  syncEmail: "sync@ejemplo.com",
  syncPassword: "clave",
};

export function productoRemoto(sobrescribir: FilaRemota = {}): FilaRemota {
  return {
    id: "prod-remoto-1",
    codigo_barra: null,
    descripcion: "Arroz a granel",
    tipo_venta: "granel",
    unidad_medida: "lb",
    costo: 30,
    pct_ganancia: 20,
    precio_venta: 45,
    precio_mayoreo: 42,
    precio_2: 40,
    precio_3: 38,
    cantidad_minima_mayoreo: 10,
    departamento_id: null,
    impuesto_tipo: "exento",
    tasa_impuesto: 0,
    existencia: null,
    politica_sin_existencia: "advertir",
    activo: true,
    favorito: false,
    created_at: "2026-09-24T10:00:00+00:00",
    updated_at: "2026-09-24T10:00:00+00:00",
    deleted_at: null,
    ...sobrescribir,
  };
}
