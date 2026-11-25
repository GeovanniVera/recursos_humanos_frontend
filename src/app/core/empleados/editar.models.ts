/**
 * Payloads of the edit endpoints (E-04, E-10, E-11 and the 1:N folders).
 *
 * Every field keeps the snake_case of the wire format: nothing is renamed on
 * the way in or out, so each interface maps 1:1 to the JSON body.
 *
 * The four scalars are the whole editable universe of `empleados`. The studies
 * and the external jobs left the flat table: they are folders and have their
 * own endpoints.
 */

/**
 * Body of `PATCH /api/empleados/{id}`.
 *
 * The screen sends only the fields that really changed; the backend validates
 * each one against the actor's matrix and rejects anything it cannot write.
 */
export interface EdicionEmpleadoRequest {
  exp_publico_anios?: number | null;
  exp_privado_anios?: number | null;
  observaciones?: string | null;
  /**
   * Optimistic-concurrency token: the `actualizado_en` of the record that was
   * read. If the record changed since then, the API answers `409`.
   */
  updated_at?: string | null;
}

/** Body of `POST /api/empleados/{id}/grados`. */
export interface GradoAcademicoRequest {
  nivel_estudios_id: number;
  titulo_o_carrera: string;
  escuela_procedencia: string;
  generacion?: string | null;
  cedula_profesional?: string | null;
  /** The backend promotes the first degree of the folder even without this. */
  es_maximo?: boolean;
}

/** Body of `PATCH /api/empleados/{id}/grados/{grado}`. */
export type ActualizarGradoAcademicoRequest = Partial<GradoAcademicoRequest>;

/** Body of `POST /api/empleados/{id}/empleos-externos`. */
export interface EmpleoExternoRequest {
  institucion_o_empresa: string;
  puesto_o_actividad: string;
  horario_o_jornada: string;
  vigente?: boolean;
  observaciones?: string | null;
}

/** Body of `PATCH /api/empleados/{id}/empleos-externos/{empleo}`. */
export type ActualizarEmpleoExternoRequest = Partial<EmpleoExternoRequest>;

/**
 * Body of `POST /api/empleados/{id}/adscripcion`.
 *
 * The CCT category is derived from the post by the server and the effective
 * date is the server's day, so neither travels in the body.
 *
 * The category of the chosen post also decides whether the working condition is
 * chosen or fixed. When it is not `mando_medio_superior` (`docente` or
 * `administrativo`), `tipo_personal` and `tipo_jornada` are mandatory and carry
 * what the operator picked. When it is, the server accepts only `No Aplica` and
 * `Mixta`: a chosen pair for a management post is rejected.
 */
export interface CambiarAdscripcionRequest {
  area_id: number;
  puesto_id: number;
  /** `No Aplica` only for a management post; a real choice for any other one. */
  tipo_personal: string;
  /** `Mixta` only for a management post; a real choice for any other one. */
  tipo_jornada: string;
  nota?: string | null;
}

/** One period of `GET /api/empleados/{id}/historial`. */
export interface AdscripcionHistorialItem {
  id: number;
  desde: string | null;
  hasta: string | null;
  area_id: number | null;
  area: string | null;
  puesto_id: number | null;
  puesto: string | null;
  categoria_cct_id: number | null;
  categoria_cct_clave: string | null;
  motivo: string | null;
  /** An open period is the appointment in force. */
  estado: 'vigente' | 'cerrado';
}

/** `200` answer of `GET /api/empleados/{id}/historial`. */
export interface AdscripcionHistorialResponse {
  data: AdscripcionHistorialItem[];
}

/** Body of `PATCH /api/empleados/{id}/identidad` (E-10). */
export interface RectificarIdentidadRequest {
  nombre?: string;
  curp?: string | null;
  fecha_nacimiento?: string | null;
  sexo?: string | null;
  entidad_nacimiento?: string | null;
  estado_civil_id?: number | null;
  correo_institucional?: string | null;
  motivo_rectificacion: string;
}

/** Body of `PATCH /api/empleados/{id}/num-empleado` (E-11). */
export interface CorregirNumEmpleadoRequest {
  num_empleado: string;
  motivo_correccion: string;
}

/**
 * Error envelope of the edit endpoints.
 *
 * Three vocabularies live here: the `409`/`500` carry `mensaje` plus a contract
 * `codigo` (`conflicto_concurrencia`, `empleado_dado_de_baja`), the `403` of a
 * denied capability also carries `codigo`, and the `401`/`422` use Laravel's
 * `message` with `errors` per field.
 */
export interface EdicionError {
  mensaje?: string;
  message?: string;
  codigo?: string;
  errors?: Record<string, string[]>;
}
