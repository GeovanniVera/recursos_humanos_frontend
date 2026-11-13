/**
 * Payloads of `/api/catalogos` — the data behind the registration form and the
 * employee record, seen from the side that administers it.
 *
 * Field names stay in snake_case on purpose: they are the wire format of the
 * backend, so every interface maps 1:1 to the JSON body and nothing has to be
 * transformed on the way in or out.
 *
 * These types describe the *administrative* view of the same entities that
 * `core/empleados/alta.models.ts` reads for the form. Unlike that view, a row
 * here carries `activo`, the category it declares and every area it belongs to;
 * it does **not** carry usage counters. The real contract answers those as
 * filters (`sin_empleados`, `sin_area`) and as the diagnostics endpoint, so a
 * column of counts would be a number the backend never sent.
 *
 * The module is association-only: nothing is created, renamed or deactivated
 * from here. What can change is which areas a post belongs to and which CCT
 * category it declares.
 */

/** Every answer of this API wraps its payload in `data` — except two. */
export interface ApiEnvelope<T> {
  data: T;
}

/** The CCT category a post declares, already resolved by the backend. */
export interface PuestoCategoria {
  id: number;
  clave: string;
  tipo: string;
  descripcion: string;
}

/** One area a post belongs to. The list arrives with no guaranteed order. */
export interface PuestoArea {
  id: number;
  nombre: string;
}

/**
 * One post, as the catalog lists it.
 *
 * The list is complete: it includes the inactive posts. A post belongs to zero
 * or more areas, and `areas: []` is that "still pending assignment" state —
 * exactly what the `puestos_sin_area` diagnostic counts and what `sin_area=1`
 * returns. `categoria` is `null` while the post declares none, which is not the
 * same as declaring an inactive one.
 */
export interface PuestoCatalogo {
  id: number;
  nombre: string;
  activo: boolean;
  categoria: PuestoCategoria | null;
  areas: PuestoArea[];
}

/**
 * Query of `GET /catalogos/puestos`.
 *
 * All three are resolved by the backend, not by the screen: "a post nobody
 * holds" is not a fact a row carries, so it cannot be computed locally.
 * Omitted is "no narrowing", which is different from `activo: false`.
 */
export interface PuestosFiltros {
  /** `sin_area=1` — only the posts still waiting for an area. */
  sin_area?: boolean;
  /** `sin_empleados=1` — only the posts no employee holds. */
  sin_empleados?: boolean;
  /** `activo=1|0`. Omitted, both states come back. */
  activo?: boolean;
}

/**
 * Body of `PATCH /catalogos/puestos/{id}`.
 *
 * `categoria_cct_id` is the only field the endpoint accepts: every other one is
 * `prohibited` and answers `422`.
 */
export interface EditarPuestoRequest {
  categoria_cct_id: number;
}

/** Body of `POST /catalogos/puestos/asignar-area`. */
export interface AsignarAreaRequest {
  puesto_ids: number[];
  area_id: number;
}

/**
 * `200` answer of `POST /catalogos/puestos/asignar-area`, read **unwrapped**.
 *
 * This is one of the two endpoints of the catalog that does not answer with a
 * `data` envelope. The call is idempotent: `creados` counts the pairs that did
 * not exist yet and can be `0` for a set of posts that already belong to the
 * area. `puestos` carries those rows already updated, so the table can replace
 * them instead of asking for the whole list again.
 */
export interface AsignarAreaResponse {
  creados: number;
  puestos: PuestoCatalogo[];
}

/**
 * `200` answer of `DELETE /catalogos/puestos/{puesto}/areas/{area}`.
 *
 * `desasociado` is `false` when the pair did not exist: the request is a no-op,
 * not a failure.
 */
export interface DesasociarAreaResponse {
  desasociado: boolean;
}

/**
 * One CCT category.
 *
 * `tipo` is what ties a category to a post. The catalog is read-only here: the
 * screen picks an existing category for a post, never edits the category.
 */
export interface CategoriaCatalogo {
  id: number;
  clave: string;
  tipo: string;
  /** The backend may store no description at all. */
  descripcion: string | null;
  activo: boolean;
}

/**
 * One node of the organization chart, flat.
 *
 * The endpoint sends the chart as a forest with `padre_id`, never as nested
 * objects: building the tree is the client's job. `tipo_area`, `naturaleza` and
 * `orden` travel in the same row; they are declared so a future column does not
 * have to guess them, and no screen of this iteration displays them.
 */
export interface AreaCatalogo {
  id: number;
  padre_id: number | null;
  nombre: string;
  tipo_area?: string;
  naturaleza?: string;
  orden?: number;
  /** `false` for the grouping nodes: they order the chart, they do not hold staff. */
  asignable: boolean;
  activo: boolean;
}

/**
 * A post whose classification disagrees with the employees holding it.
 *
 * `empleados_en_contra` counts the employees whose record contradicts the
 * declared `tipo_puesto` (a `mando_medio` post held by staff with a personal
 * type, for instance).
 */
export interface PuestoClasificacionContradicha {
  puesto: string;
  tipo_puesto: string;
  empleados_en_contra: number;
}

/**
 * `200` answer of `GET /catalogos/diagnostico`, read **unwrapped**.
 *
 * Every counter is a finding: `0` means "nothing to review", which is the good
 * answer, so none of them is optional.
 */
export interface CatalogoDiagnostico {
  puestos_sin_area: number;
  puestos_sin_empleados: number;
  categorias_sin_uso: number;
  empleados_sin_area: number;
  puestos_con_clasificacion_contradicha: PuestoClasificacionContradicha[];
}

/**
 * Domain failure of the API: `mensaje` plus a contract `codigo`.
 *
 * The codes the screen reacts to are `permiso_denegado` (403) and
 * `puesto_con_empleados` (409).
 */
export interface ErrorDominio {
  mensaje?: string;
  codigo?: string;
}

/**
 * `422` envelope of Laravel, which this API keeps for validation failures.
 *
 * `errors` holds the messages of each field, already in Spanish and specific.
 */
export interface ErrorValidacion {
  message: string;
  errors: Record<string, string[]>;
}
