export interface AdaptadorInicioAutomatico {
  estaActivo: () => Promise<boolean>;
  activar: () => Promise<void>;
  desactivar: () => Promise<void>;
}

let adaptador: AdaptadorInicioAutomatico | null = null;

export function configurarAdaptadorInicioAutomatico(a: AdaptadorInicioAutomatico | null): void {
  adaptador = a;
}

export function obtenerAdaptadorInicioAutomatico(): AdaptadorInicioAutomatico | null {
  return adaptador;
}
