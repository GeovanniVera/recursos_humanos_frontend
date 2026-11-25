/**
 * Orchestration of the employee draft: what is validated, what is sent, and what
 * the document derives by itself.
 *
 * Pure TypeScript on purpose — no Angular, no signals, no `inject`, no HTTP, no
 * DOM. Two surfaces consume these rules: the edit page, which owns the whole
 * draft today, and the alta drawer that is replacing the registration route.
 * Two copies of the same rules would drift the moment one of them is touched,
 * and the drift would be invisible: each screen looks right on its own while
 * disagreeing with the other and with the backend.
 *
 * Every function takes the draft plus the catalogue slices it needs, and returns
 * data. Nothing here reads a component, a service or a global.
 */

import {
  AltaEmpleadoRequest,
  CategoriaCctCatalogo,
  EntidadCatalogo,
  PuestoCatalogo,
} from './alta.models';
import {
  MENSAJE_CURP_INVALIDA,
  curpClaveEntidad,
  curpFechaNacimiento,
  curpSexo,
  normalizarCorreo,
  normalizarNombre,
  trabajaOtroDondeRequerido,
  validarAniosExperiencia,
  validarCorreo,
  validarCurp,
  validarFecha,
  validarGeneracion,
  validarInicioPuesto,
  validarLargo,
  validarNombre,
  validarNumEmpleado,
} from './validacion';

/**
 * What the user has typed so far.
 *
 * Every field exists from the start and holds its empty value (`''` or `null`),
 * because the draft is the single source of truth of the form: a field that is
 * not on screen still keeps its value, and a `422` never resets it.
 */
export interface BorradorAlta {
  num_empleado: string;
  nombre: string;
  curp: string;
  fecha_nacimiento: string;
  sexo: string;
  estado_civil_id: number | null;
  entidad_nacimiento: string;
  correo_institucional: string;
  area_id: number | null;
  puesto_id: number | null;
  tipo_personal: string;
  tipo_jornada: string;
  fecha_inicio_puesto: string;
  fecha_ingreso_gobierno: string;
  nivel_estudios_id: number | null;
  escuela_procedencia: string;
  generacion: string;
  exp_publico_anios: number | null;
  exp_privado_anios: number | null;
  trabaja_otro_lugar: string;
  trabaja_otro_donde: string;
  observaciones: string;
}

/** Optional text fields of the request, all `string | undefined` on the wire. */
type CampoTexto =
  | 'curp'
  | 'fecha_nacimiento'
  | 'fecha_ingreso_gobierno'
  | 'escuela_procedencia'
  | 'generacion'
  | 'sexo'
  | 'observaciones';

/**
 * Text fields the form fills by itself: they have no control to type into.
 *
 * `entidad_nacimiento` travels as the two-character key read from the CURP, so it
 * is never one of the editable ones above and never a `<select>` value.
 */
type CampoDerivadoTexto = 'entidad_nacimiento';

/** Optional numeric fields of the request. */
type CampoNumero =
  'exp_publico_anios' | 'exp_privado_anios' | 'nivel_estudios_id' | 'estado_civil_id';

/** Fields chosen with a `<select>` that carries a foreign key. */
export type CampoSelectNumero = 'area_id' | 'puesto_id' | 'estado_civil_id' | 'nivel_estudios_id';

/** Fields chosen with a `<select>` that carries the literal value. */
export type CampoSelectTexto = 'sexo' | 'tipo_personal' | 'tipo_jornada' | 'trabaja_otro_lugar';

/** `trabaja_otro_lugar` value that turns `trabaja_otro_donde` off. */
export const OTRO_LUGAR_NO = 'No';

/** Values the backend fixes for a `mando_medio_superior` post. They are the only accepted ones. */
export const PERSONAL_MANDO_MEDIO = 'No Aplica';
export const JORNADA_MANDO_MEDIO = 'Mixta';

/** Category type whose posts carry neither a personal type nor a shift to choose. */
export const MANDO_MEDIO_SUPERIOR = 'mando_medio_superior';

/**
 * Sentence of an empty control that carries a typed value, not a choice.
 *
 * The message is the signal of the state, not the colour: every one of them
 * names what to do next.
 */
const MENSAJE_REQUERIDO_TEXTO = 'Completa este dato.';

/** Sentence of a required `<select>` still sitting on its placeholder. */
const MENSAJE_REQUERIDO_OPCION = 'Elige una opción.';

/**
 * Sentence of the plaza when the chosen post points at no category.
 *
 * The category is derived from the post and the user cannot change it, so the
 * message sits under the post: that is the control that has to be fixed, and it
 * is fixed in `Catálogos`, not here.
 */
const MENSAJE_PUESTO_SIN_CATEGORIA =
  'El puesto elegido no tiene categoría asignada. Asignale una desde Catálogos.';

/** Empty draft. `trabaja_otro_lugar` starts on the backend default, `No`. */
export const BORRADOR_ALTA: BorradorAlta = {
  num_empleado: '',
  nombre: '',
  curp: '',
  fecha_nacimiento: '',
  sexo: '',
  estado_civil_id: null,
  entidad_nacimiento: '',
  correo_institucional: '',
  area_id: null,
  puesto_id: null,
  tipo_personal: '',
  tipo_jornada: '',
  fecha_inicio_puesto: '',
  fecha_ingreso_gobierno: '',
  nivel_estudios_id: null,
  escuela_procedencia: '',
  generacion: '',
  exp_publico_anios: null,
  exp_privado_anios: null,
  trabaja_otro_lugar: OTRO_LUGAR_NO,
  trabaja_otro_donde: '',
  observaciones: '',
};

/**
 * Section that owns each field of the request.
 *
 * A `422` names the fields that failed; the screen uses this table to jump to
 * the card that holds the first one instead of leaving the user staring at a
 * summary while the message sits on another screen.
 *
 * The index is a **section**, not a step: the alta page reads it as the index of
 * its wizard step, and the drawer reads the same number as the index of its tab.
 * Renaming the groups is therefore a change of navigation, not of validation.
 */
export const SECCION_DE_CAMPO: Readonly<Record<string, number>> = {
  num_empleado: 0,
  nombre: 0,
  curp: 0,
  fecha_nacimiento: 0,
  sexo: 0,
  estado_civil_id: 0,
  entidad_nacimiento: 0,
  correo_institucional: 0,
  area_id: 1,
  puesto_id: 1,
  tipo_personal: 1,
  tipo_jornada: 1,
  fecha_inicio_puesto: 1,
  fecha_ingreso_gobierno: 1,
  nivel_estudios_id: 2,
  escuela_procedencia: 2,
  generacion: 2,
  exp_publico_anios: 2,
  exp_privado_anios: 2,
  trabaja_otro_lugar: 2,
  trabaja_otro_donde: 2,
  observaciones: 2,
};

/**
 * Catalogue slices the rules read, as plain data.
 *
 * Only the three the rules genuinely need, never the whole `FormularioCatalogos`:
 * a screen must be able to evaluate a draft without having loaded the levels of
 * schooling or the marital statuses, which only the summary reads.
 */
export interface ContextoBorrador {
  /**
   * Every post of the catalogue, **not** the ones the chosen area offers.
   *
   * `puesto_id` is resolved against this list: a post outside the current area
   * still has a category, and answering "unknown post" there would silence the
   * message that says the post has no category — the very case this lookup
   * exists to report.
   */
  readonly puestos: readonly PuestoCatalogo[];
  /** Categories, to answer whether a post is held by a `mando_medio_superior` one. */
  readonly categorias: readonly CategoriaCctCatalogo[];
  /**
   * Federative entities of birth, to answer whether the key a CURP carries is one
   * RENAPO issues. A key that is not in this list never travels.
   */
  readonly entidades: readonly EntidadCatalogo[];
}

/**
 * Values the request carries instead of the ones in the draft.
 *
 * A `mando_medio_superior` post fixes `tipo_personal` and `tipo_jornada` on the
 * server, so the alta route fills them in; the edit route sends what the record
 * already holds, because a protected value is never re-derived. The caller
 * resolves both, so this module never needs to know which route it serves.
 */
export interface DerivadosAlta {
  readonly tipoPersonal: string;
  readonly tipoJornada: string;
}

/**
 * What an evaluation leaves out.
 *
 * The edit route protects the fields the allowlist does not carry: a legacy value
 * that fails a current rule cannot be fixed on that screen, so scolding the user
 * for it would name a control that does not exist and would block a save that has
 * nothing to do with it.
 */
export interface OpcionesEvaluacion {
  /** Fields whose local message is not produced at all. */
  readonly camposProtegidos?: readonly string[];
}

/** Post of the draft, or `null` while none is chosen. */
function puestoDe(id: number | null, ctx: ContextoBorrador): PuestoCatalogo | null {
  if (id === null) {
    return null;
  }
  return ctx.puestos.find((puesto) => puesto.id === id) ?? null;
}

/** Category a post points at, or `null` when the catalogue does not carry it. */
export function categoriaDePuesto(
  puesto: PuestoCatalogo | null,
  ctx: ContextoBorrador,
): CategoriaCctCatalogo | null {
  if (puesto === null) {
    return null;
  }

  return ctx.categorias.find((categoria) => categoria.id === puesto.categoria_cct_id) ?? null;
}

/**
 * Key of the entity that may travel: the one the catalogue knows, or `''`.
 *
 * A key RENAPO does not issue would come back as a `422`, and the field exists
 * to inform: an empty one says "the CURP does not give a known entity", which is
 * the truth the screen can stand behind.
 */
export function claveDeEntidad(
  clave: string | null,
  entidades: readonly EntidadCatalogo[],
): string {
  if (clave === null) {
    return '';
  }
  return entidades.some((entidad) => entidad.clave === clave) ? clave : '';
}

/**
 * `true` when the post of the draft is held by a `mando_medio_superior` category.
 *
 * Exported because it is not only a validation rule: the form hides the two
 * controls it overrides, and a screen that restated the test would be able to
 * hide them while the evaluator still asked for them.
 */
export function esMandoMedioDe(datos: BorradorAlta, ctx: ContextoBorrador): boolean {
  return categoriaDePuesto(puestoDe(datos.puesto_id, ctx), ctx)?.tipo === MANDO_MEDIO_SUPERIOR;
}

/**
 * `tipo_personal` the request carries for this draft.
 *
 * A `mando_medio_superior` post fixes the value on the server, so the screen
 * sends the only one it accepts; every other post sends what the user chose.
 */
export function tipoPersonalDe(datos: BorradorAlta, ctx: ContextoBorrador): string {
  return esMandoMedioDe(datos, ctx) ? PERSONAL_MANDO_MEDIO : datos.tipo_personal;
}

/** `tipo_jornada` the request carries, for the same reason as `tipoPersonalDe`. */
export function tipoJornadaDe(datos: BorradorAlta, ctx: ContextoBorrador): string {
  return esMandoMedioDe(datos, ctx) ? JORNADA_MANDO_MEDIO : datos.tipo_jornada;
}

/**
 * Both derived values, resolved in one call.
 *
 * `construirCuerpoAlta` needs the pair together, and asking for them separately
 * at the call site is the shape that lets one of the two be forgotten.
 */
export function derivadosDe(datos: BorradorAlta, ctx: ContextoBorrador): DerivadosAlta {
  return { tipoPersonal: tipoPersonalDe(datos, ctx), tipoJornada: tipoJornadaDe(datos, ctx) };
}

/** `true` when the CURP can fill the birth date of the draft. */
function derivaFecha(curp: string): boolean {
  return validarCurp(curp).valida && curpFechaNacimiento(curp) !== null;
}

/**
 * Message of the post: it must be chosen, and it must carry a category.
 *
 * The category is not a control the user can fix here, so a post the catalogue
 * has no category for is named under the post itself: the server would derive
 * nothing from it, and the section cannot leave.
 */
function mensajeDePuesto(datos: BorradorAlta, ctx: ContextoBorrador): string | null {
  if (datos.puesto_id === null) {
    return MENSAJE_REQUERIDO_OPCION;
  }

  const puesto = puestoDe(datos.puesto_id, ctx);
  if (puesto === null) {
    return null;
  }

  return categoriaDePuesto(puesto, ctx) === null ? MENSAJE_PUESTO_SIN_CATEGORIA : null;
}

/** Message of the start of the post: present, real, not future, not early. */
function mensajeDeInicio(datos: BorradorAlta): string | null {
  const inicio = datos.fecha_inicio_puesto.trim();
  if (inicio === '') {
    return MENSAJE_REQUERIDO_TEXTO;
  }

  return (
    validarFecha(inicio, { noFutura: true }) ??
    validarInicioPuesto(inicio, datos.fecha_ingreso_gobierno)
  );
}

/** Message of the "where else" detail: required, and bounded to 255. */
function mensajeDeOtroDonde(datos: BorradorAlta): string | null {
  if (trabajaOtroDondeRequerido(datos.trabaja_otro_lugar) !== 'requerido') {
    return null;
  }

  const donde = datos.trabaja_otro_donde.trim();
  if (donde === '') {
    return MENSAJE_REQUERIDO_TEXTO;
  }
  return validarLargo(donde, 255);
}

/**
 * Every local failure of the draft, keyed by field, in the order the sections
 * ask for them.
 *
 * One pass instead of one rule per control: several checks compare two fields
 * (`fecha_inicio_puesto` against `fecha_ingreso_gobierno`), so a map built from
 * the whole draft is the only way to keep them coherent. The insertion order is
 * the order of the wizard, which is what lets the submit carry the user to the
 * first thing that has to be fixed.
 */
export function evaluarBorrador(
  datos: BorradorAlta,
  ctx: ContextoBorrador,
  opciones: OpcionesEvaluacion = {},
): Record<string, string> {
  const errores: Record<string, string> = {};
  const protegidos = new Set(opciones.camposProtegidos ?? []);
  const poner = (campo: string, mensaje: string | null): void => {
    if (mensaje !== null && !protegidos.has(campo)) {
      errores[campo] = mensaje;
    }
  };

  // --- Section 1: identification -------------------------------------------
  poner('num_empleado', validarNumEmpleado(datos.num_empleado));
  poner('nombre', validarNombre(datos.nombre));
  poner('correo_institucional', validarCorreo(datos.correo_institucional));
  poner('curp', validarCurp(datos.curp).valida ? null : MENSAJE_CURP_INVALIDA);

  // A derived date comes from a CURP that already passed every rule.
  if (!derivaFecha(datos.curp)) {
    poner('fecha_nacimiento', validarFecha(datos.fecha_nacimiento, { noFutura: true }));
  }

  // --- Section 2: plaza ------------------------------------------------------
  poner('area_id', datos.area_id === null ? MENSAJE_REQUERIDO_OPCION : null);
  poner('puesto_id', mensajeDePuesto(datos, ctx));
  poner('fecha_inicio_puesto', mensajeDeInicio(datos));
  poner('fecha_ingreso_gobierno', validarFecha(datos.fecha_ingreso_gobierno, { noFutura: true }));

  // A mando medio post has no personal type nor shift to choose.
  if (!esMandoMedioDe(datos, ctx)) {
    poner('tipo_personal', datos.tipo_personal.trim() === '' ? MENSAJE_REQUERIDO_OPCION : null);
    poner('tipo_jornada', datos.tipo_jornada.trim() === '' ? MENSAJE_REQUERIDO_OPCION : null);
  }

  // --- Section 3: studies and experience ------------------------------------
  poner('escuela_procedencia', validarLargo(datos.escuela_procedencia, 100));
  poner('generacion', validarGeneracion(datos.generacion));
  poner('exp_publico_anios', validarAniosExperiencia(datos.exp_publico_anios));
  poner('exp_privado_anios', validarAniosExperiencia(datos.exp_privado_anios));
  poner('trabaja_otro_donde', mensajeDeOtroDonde(datos));
  poner('observaciones', validarLargo(datos.observaciones, 2000));

  return errores;
}

/** Adds an optional text only when it carries something. */
function agregarTexto(
  cuerpo: AltaEmpleadoRequest,
  campo: CampoTexto | CampoDerivadoTexto,
  valor: string,
): void {
  const limpio = valor.trim();
  if (limpio !== '') {
    cuerpo[campo] = limpio;
  }
}

/** Adds an optional number. `0` is a real answer, so only `null` is skipped. */
function agregarNumero(
  cuerpo: AltaEmpleadoRequest,
  campo: CampoNumero,
  valor: number | null,
): void {
  if (valor !== null) {
    cuerpo[campo] = valor;
  }
}

/**
 * Body of the request: only the fields the user filled, plus the required ones.
 *
 * `ctx` is part of the signature for uniformity — every function of this module
 * takes the draft and the context first — but the body does not read it. The two
 * values the request needs from the catalogue arrive resolved in `derivados`,
 * because the alta route derives them from the post while the edit route keeps
 * the ones the record already holds. Re-deriving them here would need to know
 * which of the two routes is asking.
 */
export function construirCuerpoAlta(
  datos: BorradorAlta,
  ctx: ContextoBorrador,
  derivados: DerivadosAlta,
): AltaEmpleadoRequest {
  const cuerpo: AltaEmpleadoRequest = {
    num_empleado: datos.num_empleado.trim(),
    // The name and the address are cleaned the way they are stored: the blanks
    // of the first one collapse, and the second goes out lower-cased and with
    // the institutional domain, which the field never asked the user for.
    nombre: normalizarNombre(datos.nombre),
    correo_institucional: normalizarCorreo(datos.correo_institucional),
    // The gate of the plaza keeps these two from being empty; if a bug ever let
    // them through, the `null` would leave and the API would answer the `422`
    // that names the field, which is better than a guess made here.
    area_id: datos.area_id as number,
    puesto_id: datos.puesto_id as number,
    fecha_inicio_puesto: datos.fecha_inicio_puesto,
  };

  // A mando medio post sends the two values the server fixes for it; any other
  // post sends what the user chose.
  if (derivados.tipoPersonal !== '') {
    cuerpo.tipo_personal = derivados.tipoPersonal;
  }
  if (derivados.tipoJornada !== '') {
    cuerpo.tipo_jornada = derivados.tipoJornada;
  }

  agregarTexto(cuerpo, 'curp', datos.curp);
  agregarTexto(cuerpo, 'fecha_nacimiento', datos.fecha_nacimiento);
  agregarTexto(cuerpo, 'fecha_ingreso_gobierno', datos.fecha_ingreso_gobierno);
  agregarTexto(cuerpo, 'escuela_procedencia', datos.escuela_procedencia);
  agregarTexto(cuerpo, 'generacion', datos.generacion);
  agregarTexto(cuerpo, 'entidad_nacimiento', datos.entidad_nacimiento);
  agregarTexto(cuerpo, 'sexo', datos.sexo);
  agregarTexto(cuerpo, 'observaciones', datos.observaciones);

  agregarNumero(cuerpo, 'exp_publico_anios', datos.exp_publico_anios);
  agregarNumero(cuerpo, 'exp_privado_anios', datos.exp_privado_anios);
  agregarNumero(cuerpo, 'nivel_estudios_id', datos.nivel_estudios_id);
  agregarNumero(cuerpo, 'estado_civil_id', datos.estado_civil_id);

  const otroLugar = datos.trabaja_otro_lugar.trim();
  if (otroLugar !== '') {
    cuerpo.trabaja_otro_lugar = otroLugar;
  }
  // Prohibited when the answer is `No`: the field is not sent at all, not sent
  // empty.
  const otroDonde = datos.trabaja_otro_donde.trim();
  if (otroLugar !== OTRO_LUGAR_NO && otroDonde !== '') {
    cuerpo.trabaja_otro_donde = otroDonde;
  }

  return cuerpo;
}

/**
 * Returns the draft with what a CURP already carries: the birth date, the sex and
 * the entity.
 *
 * All three are written on every pass, `''` included. They are locked, so a value
 * left behind by a CURP that no longer exists could never be corrected by hand,
 * and it would still travel in the request claiming to be a fact of the document.
 * An empty field is honest; a survivor is a lie the user cannot fix. The entity is
 * read from the shape alone, before the completeness check, which is what lets it
 * fill while the CURP is still being typed.
 *
 * Returns a new object instead of mutating the one it receives: the caller reads
 * the draft from a signal, and an in-place write would be invisible to it.
 */
export function derivarBorrador(
  datos: BorradorAlta,
  curp: string,
  ctx: ContextoBorrador,
): BorradorAlta {
  const entidad = claveDeEntidad(curpClaveEntidad(curp), ctx.entidades);

  if (!validarCurp(curp).valida) {
    return { ...datos, entidad_nacimiento: entidad, fecha_nacimiento: '', sexo: '' };
  }

  return {
    ...datos,
    entidad_nacimiento: entidad,
    fecha_nacimiento: curpFechaNacimiento(curp) ?? '',
    // `X` means "not specified": the field stays empty instead of guessing.
    sexo: curpSexo(curp) ?? '',
  };
}
