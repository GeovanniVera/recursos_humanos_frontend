/**
 * Payloads of the termination (baja) flow and the two ways back in.
 *
 * `baja` registers the absence, `reactivar` reopens a licencia and `reingreso`
 * reopens a definitive termination with a new assignment. Every field keeps the
 * snake_case of the wire format, so each interface maps 1:1 to the JSON.
 *
 * The envelopes differ: the motive catalog wraps its list in `data`, while each
 * act answers at the root of the body with `mensaje` and `empleado`.
 */

import { EstatusEmpleado } from './ficha.models';

/** One authorised reason to terminate an employee. */
export interface MotivoBaja {
  id: number;
  /** Contract key (`BAJA_DEFINITIVA`), stable across environments. */
  clave: string;
  /** Spanish label sent by the backend, ready to display. */
  descripcion: string;
}

/** `200` answer of `GET /api/catalogos/motivos-baja`. */
export interface MotivosBajaResponse {
  data: MotivoBaja[];
}

/**
 * Body of `POST /api/empleados/{empleado}/baja`.
 *
 * Exactly two fields. The date and the actor are the server's: the endpoint
 * answers `422` when `fecha_baja`, `baja_por` or any of the aliases of the
 * motive (`motivo`, `motivo_baja`, `nota_baja`) arrive in the body.
 */
export interface BajaEmpleadoRequest {
  /** Id of an active motive of the catalog. */
  motivo_id: number;
  /** Free text, at most 1000 characters, already trimmed. */
  nota: string;
}

/**
 * The worker as an act of the lifecycle leaves it.
 *
 * The motive, its note and its author live in the absence log, not in this
 * answer: `GET /api/empleados/{id}/historial-bajas` is where they are read.
 */
export interface EmpleadoDadoDeBaja {
  id: number;
  num_empleado: string;
  nombre: string;
  estatus: EstatusEmpleado;
  /** `YYYY-MM-DD` fixed by the server, never sent by the client. */
  fecha_baja: string | null;
}

/** `200` answer of `POST /api/empleados/{empleado}/baja`. */
export interface BajaEmpleadoResponse {
  mensaje: string;
  empleado: EmpleadoDadoDeBaja;
}

/**
 * Body of `POST /api/empleados/{empleado}/reactivar` (E-06).
 *
 * Only the note: the effective date and the actor belong to the server. The
 * endpoint answers `409` when the worker is not on a leave, and
 * `reingreso_requerido` when the termination was definitive.
 */
export interface ReactivarEmpleadoPayload {
  /** Free text, at most 1000 characters, already trimmed. */
  nota_reactivacion: string;
}

/** `200` answer of `POST /api/empleados/{empleado}/reactivar`. */
export interface ReactivarEmpleadoResponse {
  mensaje: string;
  empleado: EmpleadoDadoDeBaja;
}

/**
 * Body of `POST /api/empleados/{empleado}/reingreso` (E-06).
 *
 * The new assignment is required; the start date and the CCT category are the
 * server's and are rejected with `422` when they arrive. The post must belong
 * to the chosen area.
 */
export interface ReingresarEmpleadoPayload {
  area_id: number;
  puesto_id: number;
  /** Free text, at most 1000 characters, already trimmed. */
  nota_reingreso: string;
}

/** The worker as the re-entry leaves it: lifecycle state plus new assignment. */
export interface EmpleadoReingresado extends EmpleadoDadoDeBaja {
  area_id: number | null;
  puesto_id: number | null;
  /** Derived from the post on the server, never sent by the client. */
  categoria_cct_id: number | null;
  /** `YYYY-MM-DD` fixed by the server, never sent by the client. */
  fecha_inicio_puesto: string | null;
}

/** `200` answer of `POST /api/empleados/{empleado}/reingreso`. */
export interface ReingresarEmpleadoResponse {
  mensaje: string;
  empleado: EmpleadoReingresado;
}

/**
 * Error envelope shared by the three lifecycle acts.
 *
 * It speaks two dialects at once: the `409` and the `500` carry `mensaje`, while
 * the `403` and the `422` carry Laravel's `message`. `codigo` is the contract
 * value that decides the sentence: `trabajador_ya_inactivo`,
 * `trabajador_no_dado_de_baja`, `reingreso_requerido`, `usa_reactivacion`,
 * `baja_vigente_no_encontrada`, `permiso_denegado`.
 */
export interface BajaError {
  /** Sentence of the endpoint's own errors (`409`, `500`). */
  mensaje?: string;
  /** Laravel sentence (`401`, `403`, `422`). */
  message?: string;
  /** Contract code (`trabajador_ya_inactivo`, `permiso_denegado`, …). */
  codigo?: string;
  /** Per-field messages of a `422`, keyed by the name the backend validates. */
  errors?: Record<string, string[]>;
}
