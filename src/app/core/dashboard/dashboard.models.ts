/**
 * Payloads of `GET /dashboard/resumen`.
 *
 * Field names stay in snake_case on purpose: they are the wire format of the
 * backend, so every interface maps 1:1 to the JSON body and nothing has to be
 * transformed on the way in.
 *
 * The completion percentage is deliberately absent: the backend sends counts,
 * and the ratio is a presentation concern that the client computes.
 */

/** Counters of the general panel. */
export interface ResumenDashboard {
  /** `activo = true AND fecha_baja IS NULL`. */
  empleados_activos: number;
  /** `activo = false`. */
  empleados_baja: number;
  /** Active employees whose file is complete (the fifteen effective fields). */
  expedientes_completos: number;
}

/** `200` answer of `GET /dashboard/resumen`. */
export interface ResumenDashboardResponse {
  datos: ResumenDashboard;
}

/**
 * Error envelope of the endpoint.
 *
 * `codigo` is a contract value (`permiso_denegado`, `servicio_no_disponible`),
 * not copy: it is shown to the user next to the message, untranslated.
 */
export interface ResumenDashboardError {
  message?: string;
  codigo?: string;
}
