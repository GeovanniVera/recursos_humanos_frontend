/**
 * Payloads of `GET /api/padron` (route `padron.index`).
 *
 * Field names stay in snake_case on purpose: they are the wire format of the
 * backend, so every interface maps 1:1 to the JSON body and nothing has to be
 * transformed on the way in.
 */

/** Area an employee is assigned to. `null` when the record has none. */
export interface PadronArea {
  id: number;
  nombre: string;
}

/**
 * State of an employee in the roster. The backend already sends the Spanish
 * label, so the UI shows it as it arrives instead of translating a code.
 */
export type EstadoEmpleado = 'Activo' | 'Baja';

/** One row of the roster. */
export interface EmpleadoPadron {
  id: number;
  num_empleado: string;
  nombre: string;
  /** Optional relationship: the endpoint sends `null` when there is no area. */
  area: PadronArea | null;
  estado: EstadoEmpleado;
}

/** Counters of the page that was served. */
export interface PadronMeta {
  pagina: number;
  por_pagina: number;
  total: number;
  total_paginas: number;
}

/**
 * Neighbour links of the page. Absolute URLs built by the backend; kept because
 * they belong to the contract, not used to navigate: the screen requests pages
 * by number so the query it sends never depends on a URL it did not build.
 */
export interface PadronEnlaces {
  anterior: string | null;
  siguiente: string | null;
}

/** `200` answer of `GET /api/padron`. */
export interface PadronResponse {
  datos: EmpleadoPadron[];
  meta: PadronMeta;
  enlaces: PadronEnlaces;
}

/**
 * Error envelope of the endpoint.
 *
 * The sentence arrives under `mensaje`, not `message`: this endpoint differs
 * from the OTP ones, and reading the wrong key would leave every failure
 * without its copy. `codigo` is a contract value (`permiso_denegado`,
 * `limite_consultas`, `servicio_no_disponible`), never translated.
 */
export interface PadronError {
  mensaje?: string;
  codigo?: string;
  /** Seconds the client must wait after a `429`. */
  reintentar_en_segundos?: number;
}
