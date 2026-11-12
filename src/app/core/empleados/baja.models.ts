/**
 * Payloads of the termination (baja) flow.
 *
 * Two endpoints with two different envelopes: the motive catalog wraps its list
 * in `data`, while the termination answer sits at the root of the body. Every
 * field keeps the snake_case of the wire format, so each interface maps 1:1 to
 * the JSON and the screen reads the same names the backend sends.
 */

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

/** The worker as the termination leaves it, in the `200` body. */
export interface EmpleadoDadoDeBaja {
  id: number;
  num_empleado: string;
  nombre: string;
  activo: boolean;
  /** `YYYY-MM-DD` fixed by the server, never sent by the client. */
  fecha_baja: string;
  motivo_baja: string;
  nota_baja: string;
  /** Internal key of the user who registered the termination. */
  baja_por: number;
}

/** `200` answer of `POST /api/empleados/{empleado}/baja`. */
export interface BajaEmpleadoResponse {
  mensaje: string;
  empleado: EmpleadoDadoDeBaja;
}

/**
 * Error envelope of the endpoint.
 *
 * It speaks two dialects at once: the `409` and the `500` carry `mensaje`, while
 * the `401` and the `422` carry Laravel's own `message`. Both are optional
 * because a failure can arrive with neither.
 */
export interface BajaError {
  /** Sentence of the endpoint's own errors (`409`, `500`). */
  mensaje?: string;
  /** Laravel sentence (`401`, `422`). */
  message?: string;
  /** Contract code (`trabajador_ya_inactivo`, `permiso_denegado`, …). */
  codigo?: string;
  /** Per-field messages of a `422`, keyed by the name the backend validates. */
  errors?: Record<string, string[]>;
}
