/**
 * Payloads of `GET /api/empleados` (route `empleados.index`).
 *
 * This is the listing that knows the three employment states; `/api/padron`
 * still answers only the active ones under a two-value `estado`. Both speak
 * snake_case, so every interface maps 1:1 to the JSON body.
 *
 * The list key is `datos`, not `data`: this endpoint builds its own envelope
 * instead of returning a Laravel resource collection.
 */

import { EstatusEmpleado } from './ficha.models';

/** Area an employee is assigned to. `null` when the record has none. */
export interface EmpleadoListadoArea {
  id: number;
  nombre: string;
}

/** One row of the listing. */
export interface EmpleadoListadoItem {
  id: number;
  num_empleado: string;
  nombre: string;
  /** Optional relationship: the endpoint sends `null` when there is no area. */
  area: EmpleadoListadoArea | null;
  /** Raw enum value sent by the backend. */
  estatus: EstatusEmpleado;
  /** `YYYY-MM-DD` of the open or last absence, or `null`. */
  fecha_baja: string | null;
}

/**
 * Value of the `estatus` filter.
 *
 * `todos` is the wildcard of the contract, not a fourth state: it is sent as
 * the query value and the backend answers the unfiltered listing.
 */
export type FiltroEstatus = 'todos' | EstatusEmpleado;

/** Counters of the page that was served. */
export interface EmpleadoListadoMeta {
  pagina: number;
  por_pagina: number;
  total: number;
  total_paginas: number;
}

/**
 * Neighbour links of the page. Absolute URLs built by the backend; kept because
 * they belong to the contract, not used to navigate: the screen requests pages
 * by number so the query it sends never depends on a server-built URL.
 */
export interface EmpleadoListadoEnlaces {
  anterior: string | null;
  siguiente: string | null;
}

/**
 * Counts of the search-filtered universe, one per status plus their total.
 *
 * They do NOT follow the status tab: every tab prints its own figure, which is
 * the whole point of counting the universe once. The search does narrow them,
 * because those counters would otherwise describe rows the list is not showing.
 */
export interface ContadoresEstatus {
  total: number;
  activo: number;
  licencia: number;
  baja_definitiva: number;
}

/** `200` answer of `GET /api/empleados`. */
export interface EmpleadoListadoResponse {
  datos: EmpleadoListadoItem[];
  contadores: ContadoresEstatus;
  meta: EmpleadoListadoMeta;
  enlaces: EmpleadoListadoEnlaces;
}

/**
 * Error envelope of the endpoint.
 *
 * It mixes both vocabularies: the throttling and the service failure carry
 * `mensaje` plus `codigo`, while the `403` of a denied capability also brings
 * `codigo`. A `422` is Laravel's own `{ message, errors }`.
 */
export interface EmpleadoListadoError {
  mensaje?: string;
  codigo?: string;
  /** Seconds to wait on a `429` (`limite_consultas`). */
  reintentar_en_segundos?: number;
  /** Laravel sentence (`422`). */
  message?: string;
  /** Per-field messages of a `422`. */
  errors?: Record<string, string[]>;
}
