export interface VentaPorDia {
  fecha: string;
  totalVentas: number;
  cantidadFacturas: number;
}

export interface ProductoVendido {
  productoId: string | null;
  descripcion: string;
  cantidadVendida: number;
  totalVendido: number;
}

export interface ResumenGanancia {
  ingresos: number;
  costoEstimado: number;
  gananciaEstimada: number;
  /** Parte de `ingresos` que viene de líneas sin producto vinculado (venta rápida/artículo
   *  suelto): su costo real es desconocido, así que NO suma a `costoEstimado` y la ganancia
   *  mostrada queda inflada en esa proporción. Se expone aparte para que la pantalla lo advierta
   *  en vez de dejar que el número final se vea "correcto" sin serlo. */
  ingresosSinCosto: number;
}

export interface ResumenItbis {
  totalGravado: number;
  totalExento: number;
  totalItbis: number;
}

export interface ResumenPorMetodo {
  metodo: string;
  total: number;
}
