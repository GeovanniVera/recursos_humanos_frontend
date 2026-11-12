/**
 * Payloads of the registration flow: `GET /api/empleados/formulario` and
 * `POST /api/empleados`.
 *
 * Every interface keeps the snake_case of the wire format: nothing is renamed
 * on the way in or out, so each one maps 1:1 to the JSON body the backend
 * validates. The request type mirrors `RegistrarEmpleadoRequest`, field by
 * field, including the fields the client must never send — those are simply
 * absent here, so a component cannot send them by accident.
 */

/**
 * One area of the organization chart.
 *
 * The endpoint sends the whole chart **flat**: `padre_id` gives the hierarchy
 * and `asignable` says whether an employee can be placed there. Building the
 * tree is the client's job, and only an assignable node can be chosen.
 */
export interface CatalogoAreas {
  id: number;
  /** Parent area, or `null` for a root (`Rectoría`). */
  padre_id: number | null;
  nombre: string;
  tipo_area: string;
  naturaleza: string;
  orden: number;
  /** `false` for the grouping nodes: they exist to order the chart, not to hold staff. */
  asignable: boolean;
}

/** One post. `tipo_puesto` decides the allowed `categoria_cct.tipo` and whether the post is `mando_medio`. */
export interface PuestoCatalogo {
  id: number;
  nombre: string;
  tipo_puesto: string;
}

/**
 * One CCT category. `tipo` has to match the `tipo_puesto` of the chosen post:
 * the backend answers `422` otherwise, so the client filters the options.
 */
export interface CategoriaCctCatalogo {
  id: number;
  clave: string;
  tipo: string;
  descripcion: string | null;
}

/** Schooling level. */
export interface NivelEstudiosCatalogo {
  id: number;
  clave: string;
  descripcion: string;
}

/** Marital status. */
export interface EstadoCivilCatalogo {
  id: number;
  clave: string;
  descripcion: string;
}

/**
 * One municipality. The registration sends its **name**, not its id: the
 * request validates `exists:catalogo_municipios,nombre`.
 */
export interface MunicipioCatalogo {
  id: number;
  nombre: string;
  entidad: string;
}

/**
 * Whole body of `GET /api/empleados/formulario`.
 *
 * This endpoint is not wrapped in `data`: the catalogs arrive at the root of
 * the body, exactly as typed here.
 */
export interface FormularioCatalogos {
  areas: CatalogoAreas[];
  puestos: PuestoCatalogo[];
  categorias_cct: CategoriaCctCatalogo[];
  niveles_estudios: NivelEstudiosCatalogo[];
  estados_civiles: EstadoCivilCatalogo[];
  tipos_personal: string[];
  sexos: string[];
  municipios: MunicipioCatalogo[];
  tipos_jornada: string[];
  trabaja_otro_lugar: string[];
}

/**
 * Body of `POST /api/empleados`, straight from `RegistrarEmpleadoRequest`.
 *
 * `tipo_personal` and `tipo_jornada` are required **unless** the post is
 * `mando_medio`: the server then fixes them to `No Aplica` and `Mixta`, and
 * those two are the only values it accepts. They stay optional in the type
 * because the type describes the request, not one branch of it.
 *
 * Fields marked optional are omitted when the user leaves them empty: an absent
 * field is "not declared", while an empty string is a value the validators
 * reject. `trabaja_otro_donde` is prohibited when `trabaja_otro_lugar` is `No`,
 * so the caller must not send it in that case.
 */
export interface AltaEmpleadoRequest {
  // --- Required -------------------------------------------------------------
  /** Employee number, max 20. */
  num_empleado: string;
  /** Full name, max 150. */
  nombre: string;
  area_id: number;
  puesto_id: number;
  /** `YYYY-MM-DD`, not in the future and never before `fecha_ingreso_gobierno`. */
  fecha_inicio_puesto: string;
  categoria_cct_id: number;
  /** Max 150, institutional domain only. */
  correo_institucional: string;
  /** Required unless the post is `mando_medio`. */
  tipo_personal?: string;
  /** Required unless the post is `mando_medio`. */
  tipo_jornada?: string;

  // --- Optional -------------------------------------------------------------
  curp?: string;
  /** `YYYY-MM-DD`. */
  fecha_nacimiento?: string;
  /** `YYYY-MM-DD`. */
  fecha_ingreso_gobierno?: string;
  /** 0–100. */
  exp_publico_anios?: number;
  /** 0–100. */
  exp_privado_anios?: number;
  /** `No` (default), `Publico` or `Privado`. */
  trabaja_otro_lugar?: string;
  /** Required when `trabaja_otro_lugar` is not `No`; prohibited when it is. */
  trabaja_otro_donde?: string;
  nivel_estudios_id?: number;
  /** Max 100. */
  escuela_procedencia?: string;
  /** `AAAA-AAAA`, the end never before the start. */
  generacion?: string;
  /** **Name** of the municipality, not its id. */
  municipio?: string;
  /** `Masculino` or `Femenino`. */
  sexo?: string;
  estado_civil_id?: number;
  /** Max 2000. */
  observaciones?: string;
}

/**
 * `201` answer of `POST /api/empleados`: the created worker as a plain resource
 * object, not wrapped in `data`.
 *
 * Only the fields the screen uses are typed. The rest of the record travels in
 * the body, and the endpoint's own documentation is the reference for it.
 */
export interface EmpleadoRegistrado {
  id: number;
  num_empleado: string;
  nombre: string;
  correo_institucional?: string | null;
  activo?: boolean;
}

/**
 * `422` envelope, Laravel's default one — this endpoint does not override it.
 *
 * `message` is a general sentence, and every entry of `errors` holds the
 * messages of one field, already in Spanish and specific. They are displayed
 * verbatim, next to the field that failed.
 */
export interface ErrorValidacion {
  message: string;
  errors: Record<string, string[]>;
}
