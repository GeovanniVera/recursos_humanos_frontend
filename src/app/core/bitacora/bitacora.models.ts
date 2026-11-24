export type BitacoraOrden = 'asc' | 'desc';

export interface BitacoraMeta {
  pagina: number;
  por_pagina: number;
  total: number;
  total_paginas: number;
}

export interface BitacoraEnlaces {
  anterior: string | null;
  siguiente: string | null;
}

/** Fila del listado. No tiene snapshots ni IP: el contrato no los envía. */
export interface BitacoraMovimiento {
  id: number;
  fecha: string; // ISO-8601 UTC
  usuario_id: number | null;
  usuario_historico: string;
  /**
   * Correo del actor. El backend debe incluirlo en el detalle; se acepta tanto
   * `correo` como `usuario_correo` para no depender de un solo nombre de campo.
   */
  correo?: string | null;
  usuario_correo?: string | null;
  accion: string;
  modulo: string;
  descripcion: string;
}

export interface BitacoraListadoResponse {
  datos: BitacoraMovimiento[];
  meta: BitacoraMeta;
  enlaces: BitacoraEnlaces;
}

/** Detalle: agrega lo que el listado deliberadamente omite. */
export interface BitacoraDetalle extends BitacoraMovimiento {
  ip: string | null;
  datos_antes: Record<string, unknown> | null;
  datos_despues: Record<string, unknown> | null;
}

export interface BitacoraDetalleResponse {
  datos: BitacoraDetalle;
}

/** Cuerpo de error; `403` usa `message` y el resto `mensaje`. */
export interface BitacoraError {
  mensaje?: string;
  message?: string;
  codigo?: string;
  campo?: string;
  reintentar_en_segundos?: number;
}
