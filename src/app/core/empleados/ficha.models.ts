/**
 * Payloads of `GET /api/empleados/{id}` (route `empleados.ficha`).
 *
 * The record arrives grouped by block, and every field keeps the snake_case of
 * the wire format: nothing is renamed on the way in, so each interface maps 1:1
 * to the JSON body and the screen reads the same names the backend sends.
 *
 * `{id}` is the internal primary key, not `num_empleado`: the roster row carries
 * both, and only the key addresses the record.
 */

/** Identification of the worker. */
export interface FichaIdentificacion {
  num_empleado: string;
  nombre: string;
  curp: string | null;
  /** `YYYY-MM-DD`, or `null` when the date is not registered. */
  fecha_nacimiento: string | null;
  /** Raw backend string (`M`, `F`, …). It is shown verbatim, never translated. */
  sexo: string | null;
  estado_civil_id: number | null;
  /** Spanish label sent by the backend, ready to display. */
  estado_civil: string | null;
  /**
   * Readable name of the birth entity, ready to display. The record stores the
   * two-character key of the CURP; the endpoint resolves it here.
   */
  entidad_nacimiento: string | null;
}

/**
 * Years, months and days served by the backend and the sentence it builds with
 * them. `texto` is UI copy already: it can read `Sin fecha de inicio
 * registrada`, so it is displayed as it arrives instead of being recomposed.
 */
export interface FichaAntiguedad {
  anios: number;
  meses: number;
  dias: number;
  texto: string;
}

/** Post, area and dates of the appointment. */
export interface FichaPlaza {
  area_id: number | null;
  area: string | null;
  puesto_id: number | null;
  puesto: string | null;
  /** Raw backend string (`Confianza`, `Base`, …). */
  tipo_puesto: string | null;
  categoria_cct_id: number | null;
  categoria_cct_clave: string | null;
  /** Raw backend string (`Sindicalizado`, …). */
  tipo_personal: string | null;
  /** Raw backend string (`Completa`, …). */
  tipo_jornada: string | null;
  /** `YYYY-MM-DD`, or `null`. */
  fecha_inicio_puesto: string | null;
  /** `YYYY-MM-DD`, or `null`. */
  fecha_ingreso_institucion: string | null;
  /** `YYYY-MM-DD`, or `null`. */
  fecha_ingreso_gobierno: string | null;
  /** Always an object: `texto` says so when there is no start date. */
  antiguedad: FichaAntiguedad;
}

/** Reachability of the worker. */
export interface FichaContacto {
  correo_institucional: string | null;
}

/** Accumulated experience declared by the worker. */
export interface FichaExperiencia {
  exp_publico_anios: number | null;
  exp_privado_anios: number | null;
}

/**
 * One academic degree of the worker's 1:N folder.
 *
 * `nivel_estudios` is the readable label the backend resolves, not an object:
 * the wire format sends `nivel_estudios_id` for the form and the description
 * for the sheet. `es_maximo` arrives as a boolean even though the column stores
 * `1`/`NULL`, because the API speaks of a maximum degree, not of an index.
 */
export interface GradoAcademico {
  id: number;
  nivel_estudios_id: number;
  nivel_estudios: string | null;
  titulo_o_carrera: string | null;
  escuela_procedencia: string | null;
  generacion: string | null;
  cedula_profesional: string | null;
  es_maximo: boolean;
  creado_en?: string | null;
  actualizado_en?: string | null;
}

/** One external job of the worker's 1:N folder. */
export interface EmpleoExterno {
  id: number;
  institucion_o_empresa: string;
  puesto_o_actividad: string | null;
  horario_o_jornada: string | null;
  vigente: boolean;
  observaciones: string | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
}

/**
 * What the current actor may write through the edit endpoint.
 *
 * The backend computes it per role; the screen reads it instead of keeping its
 * own copy of the policy. An empty list means "no field is editable", which is
 * the answer for a role without E-04.
 */
export interface FichaEdicion {
  campos_editables: string[];
}

/**
 * State of the file, as the backend computes it. The three values are the whole
 * contract of the traffic light; the screen pairs each one with its own word so
 * the state never depends on the colour alone.
 */
export type EstadoExpediente = 'completo' | 'casi_completo' | 'incompleto';

/** Completeness of the file: how many fields are missing and which ones. */
export interface FichaEstadoExpediente {
  estado: EstadoExpediente;
  total_faltantes: number;
  /** Names of the missing fields, as the backend spells them. */
  campos_faltantes: string[];
}

/**
 * Completeness figures a page may hand to the record drawer.
 *
 * The record only carries the state of the file and the names of the missing
 * fields; the percentage and the counts are computed by the semáforo list and
 * travel with its rows. A page that already knows them passes them in, so the
 * sheet prints them without asking again: the drawer never fetches these.
 *
 * Declared here and not in `core/semaforo`: that module already imports
 * `EstadoExpediente` from this one, and the reverse import would close a cycle.
 * A `ResumenSemaforo` row satisfies this shape as it is.
 */
export interface ResumenCompletitud {
  porcentaje: number;
  total_campos: number;
  campos_completos: number;
  campos_faltantes: number;
}

/**
 * Current employment status of the worker.
 *
 * Single source of truth for `empleados.estatus`: the backend serialises the
 * raw enum value, so the wire format and this union are the same three strings.
 * A `licencia` or a `baja_definitiva` always has an absence period in the log.
 */
export type EstatusEmpleado = 'activo' | 'licencia' | 'baja_definitiva';

/** Employment status inside the system. */
export interface FichaGestionInterna {
  estatus: EstatusEmpleado;
  /** `YYYY-MM-DD`, or `null`. */
  fecha_baja: string | null;
  motivo_baja: string | null;
  nota_baja: string | null;
  observaciones: string | null;
  estado_expediente: FichaEstadoExpediente;
}

/** Full record of one worker. */
export interface FichaEmpleado {
  /** Internal primary key of the worker. */
  id: number;
  /** Last write, ISO 8601. It is the optimistic-concurrency token of the PATCH. */
  actualizado_en: string | null;
  identificacion: FichaIdentificacion;
  plaza: FichaPlaza;
  contacto: FichaContacto;
  experiencia: FichaExperiencia;
  gestion_interna: FichaGestionInterna;
  edicion: FichaEdicion;
  grados_academicos: GradoAcademico[];
  empleos_externos: EmpleoExterno[];
}

/** `200` answer of `GET /api/empleados/{id}`: Laravel wraps the record in `data`. */
export interface FichaEmpleadoResponse {
  data: FichaEmpleado;
}

/**
 * Error envelope of the endpoint.
 *
 * Unlike the roster, this endpoint speaks Laravel's own vocabulary: the
 * sentence arrives under `message`, not `mensaje`, and the `404` carries
 * `Trabajador no encontrado.` A `403` may carry `codigo`
 * (`permiso_denegado`) when the token survives; the revoked-access `403`
 * destroys the token and answers with a message only.
 */
export interface FichaError {
  message?: string;
  codigo?: string;
}

/** Explicit absence classification matching `empleados_bajas.tipo`. */
export type TipoBajaHistorial = 'licencia' | 'baja_definitiva';

/** One chronological period from `GET /api/empleados/{id}/historial-bajas`. */
export interface HistorialBaja {
  id: number;
  tipo: TipoBajaHistorial | null;
  motivo_id: number;
  motivo: string | null;
  motivo_clave: string | null;
  desde: string | null;
  hasta: string | null;
  vigente: boolean;
  nota: string | null;
  registrado_por: string | null;
  reactivado_por: string | null;
  nota_reactivacion: string | null;
  fecha_registro: string | null;
}

/** `200` answer of `GET /api/empleados/{id}/historial-bajas`. */
export interface HistorialBajasResponse {
  data: HistorialBaja[];
}
