/**
 * Copy of the employment status, in one place.
 *
 * The badge, the heading, the breadcrumb step and the empty state all name the
 * same three states. Keeping the words here is what stops the trail from saying
 * one thing while the sheet says another — they are different surfaces of the
 * same filter, not different labels.
 */

import { FiltroEstatus } from './listado.models';

/** Word the stamp of a row prints. `todos` is not a state, so it has none. */
export const ETIQUETA_ESTATUS: Readonly<Record<Exclude<FiltroEstatus, 'todos'>, string>> = {
  activo: 'Activo',
  licencia: 'Licencia',
  baja_definitiva: 'Baja definitiva',
};

/**
 * Default view of the screen.
 *
 * It is `activo` because it is the default view of `/empleados`, and it is also the
 * value the URL omits: the canonical address of the screen is its default.
 */
export const ESTATUS_INICIAL: FiltroEstatus = 'activo';

/** Heading of the sheet and last step of the breadcrumb. */
export const TITULO_ESTATUS: Readonly<Record<FiltroEstatus, string>> = {
  todos: 'Todos los empleados',
  activo: 'Empleados activos',
  licencia: 'Empleados en licencia',
  baja_definitiva: 'Bajas definitivas',
};

/** Sentence under the heading, which explains what the filter is showing. */
export const SUBTITULO_ESTATUS: Readonly<Record<FiltroEstatus, string>> = {
  todos: 'El padrón completo: personal activo, licencias y bajas definitivas.',
  activo: 'La plantilla vigente: empleados con la cuenta activa y sin fecha de baja.',
  licencia:
    'El personal con una ausencia vigente. Se reincorpora por reactivación, sin cambiar de plaza.',
  baja_definitiva:
    'El personal que cerró su relación laboral. Vuelve solo por reingreso, con una nueva adscripción.',
};
