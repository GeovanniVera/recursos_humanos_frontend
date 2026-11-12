/**
 * Rules of the registration form, ported from the backend.
 *
 * Pure functions only: no Angular, no HTTP, no DOM. The screen calls them to
 * answer while the user types, and the specs call them without a fixture.
 *
 * Every function answers `null` when the value is acceptable, or the sentence
 * the user reads. The sentences are the ones the backend collapses to, so a
 * value rejected here would be rejected there with the same words: the client
 * is not inventing a second opinion, it is giving the first one sooner.
 */

import { CategoriaCctCatalogo, PuestoCatalogo } from './alta.models';

/** Field of the CURP that failed. It is never shown as a different sentence. */
export type MotivoCurp = 'longitud' | 'formato' | 'entidad' | 'fecha' | 'digito';

/**
 * The one message of an invalid CURP.
 *
 * The backend says exactly this no matter which of the five checks failed, so
 * the client cannot be more specific without inventing a sentence of its own.
 * The motivo stays available for the tests and, at most, for the `title` of the
 * note: the user reads one sentence, not a list of rules.
 */
export const MENSAJE_CURP_INVALIDA =
  'La CURP no es válida. Revisa el formato, la entidad y el dígito verificador.';

/**
 * Technical explanation of each motivo.
 *
 * For the `title` of the note and for the tests, never for the visible
 * sentence: five different sentences would tell the user more than the backend
 * itself is willing to say.
 */
export const EXPLICACION_CURP: Readonly<Record<MotivoCurp, string>> = {
  longitud: 'La CURP debe tener 18 caracteres.',
  formato: 'La CURP no respeta el patrón oficial de 18 posiciones.',
  entidad: 'El código de la entidad federativa no existe.',
  fecha: 'La fecha de nacimiento que contiene la CURP no es real o está en el futuro.',
  digito: 'El dígito verificador no coincide con el resto de la CURP.',
};

/**
 * Alphabet of the check digit, in the exact order of the backend.
 *
 * The `Ñ` sits between the `N` and the `O`: removing it or moving it to the end
 * shifts every letter after it and turns a valid CURP into a rejected one.
 */
const TABLA = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'Ñ',
  'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
];

/** Codes of the federative entities, plus `NE` for a birth abroad. */
const ENTIDADES = [
  'AS', 'BC', 'BS', 'CC', 'CL', 'CM', 'CS', 'CH', 'DF', 'DG',
  'GT', 'GR', 'HG', 'JC', 'MC', 'MN', 'MS', 'NT', 'NL', 'OC',
  'PL', 'QT', 'QR', 'SP', 'SL', 'SR', 'TC', 'TS', 'TL', 'VZ',
  'YN', 'ZS', 'NE',
];

/**
 * Shape of a CURP: four letters, six digits, the sex, two letters of the
 * entity, three consonants, an homoclave and the check digit. The consonants
 * exclude the vowels and the characters the RENAPO does not use.
 */
const PATRON = /^[A-Z][AEIOUX][A-Z]{2}[0-9]{6}[HMX][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[0-9A-Z][0-9]$/;

/** `YYYY-MM-DD`, the only shape the API speaks for a calendar day. */
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `AAAA-AAAA`, the shape of a generation. */
const GENERACION = /^\d{4}-\d{4}$/;

/**
 * Shape of an email address.
 *
 * The same family of shape the backend accepts: something, an `@`, a domain
 * and a dot with at least two letters after it.
 */
const CORREO = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

/**
 * Domains the institutional address may use.
 *
 * This mirrors `modulos.dominios_permitidos` in the backend configuration, which
 * the `formulario` endpoint does not expose yet. When it does, read the list from
 * there and delete this constant — a second hardcoded copy of a server rule is
 * exactly the kind of drift this port is trying to avoid.
 */
const DOMINIOS_INSTITUCIONALES = ['utn.edu.mx'];

/** Days of each month, January first. February is fixed by the leap check. */
const DIAS_DEL_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** `true` when the year has a 29th of February. */
function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

/**
 * `checkdate` of PHP, ported.
 *
 * A calendar day is real when the month exists, the day exists in that month
 * and the year is a positive integer. The leap year is computed by hand
 * instead of going through `Date`: `Date.UTC` reads a year below 100 as 19xx,
 * which would silently accept the 29th of February of the year 4.
 */
function esFechaReal(anio: number, mes: number, dia: number): boolean {
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) {
    return false;
  }
  if (anio < 1 || mes < 1 || mes > 12 || dia < 1) {
    return false;
  }

  const ultimo = mes === 2 && esBisiesto(anio) ? 29 : DIAS_DEL_MES[mes - 1];
  return dia <= ultimo;
}

/** Two digits, always: `4` becomes `04`. */
function dosDigitos(valor: number): string {
  return String(valor).padStart(2, '0');
}

/**
 * `YYYY-MM-DD` of today, in the timezone of the browser.
 *
 * `toISOString()` would be the UTC day, which is tomorrow for a user who is
 * typing at dusk west of Greenwich; the upper bound of a date field has to be
 * the day the user is living in.
 */
export function hoyLocal(): string {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${dosDigitos(ahora.getMonth() + 1)}-${dosDigitos(ahora.getDate())}`;
}

/** Upper case without the surrounding blanks. The shape most fields travel in. */
export function normalizarMayusculas(valor: string): string {
  return valor.trim().toUpperCase();
}

/** CURP as the backend compares it: no blanks, no lower case. */
export function normalizarCurp(valor: string): string {
  return normalizarMayusculas(valor);
}

/**
 * Check digit of the first 17 characters of a CURP.
 *
 * Each character is worth its position in `TABLA`, weighted by how far it is
 * from the end; the digit is what is missing to reach the next multiple of ten.
 * `null` when the base is not 17 characters or carries a character outside the
 * table, because there is nothing to compare in that case.
 */
export function calcularDigitoVerificador(base17: string): number | null {
  const base = normalizarCurp(base17);
  if (base.length !== 17) {
    return null;
  }

  let suma = 0;
  for (let i = 0; i < 17; i += 1) {
    const indice = TABLA.indexOf(base[i]);
    if (indice < 0) {
      return null;
    }
    suma += indice * (18 - i);
  }

  return (10 - (suma % 10)) % 10;
}

/**
 * Birth date a CURP carries, as `YYYY-MM-DD`, or `null`.
 *
 * The six digits are `YYMMDD` and the century is not in them: the homoclave
 * (character 17, index 16) decides it. A digit is a CURP issued in the 1900s, a
 * letter is one issued from 2000 on. The date also has to be real, because a
 * CURP with a 32nd of January cannot produce a birth date to fill in.
 */
export function curpFechaNacimiento(valor: string): string | null {
  const curp = normalizarCurp(valor);
  if (curp.length !== 18) {
    return null;
  }

  const homoclave = curp[16];
  const siglo = /[0-9]/.test(homoclave) ? 1900 : /[A-Z]/.test(homoclave) ? 2000 : null;
  if (siglo === null || !/^[0-9]{6}$/.test(curp.slice(4, 10))) {
    return null;
  }

  const anio = siglo + Number(curp.slice(4, 6));
  const mes = Number(curp.slice(6, 8));
  const dia = Number(curp.slice(8, 10));

  if (!esFechaReal(anio, mes, dia)) {
    return null;
  }
  return `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}`;
}

/**
 * Sex a CURP carries, with the labels of the catalog.
 *
 * `X` means "not specified" and answers `null`: the field stays editable
 * instead of inventing a value the backend did not ask for.
 */
export function curpSexo(valor: string): 'Masculino' | 'Femenino' | null {
  const curp = normalizarCurp(valor);
  if (curp.length < 11) {
    return null;
  }

  switch (curp[10]) {
    case 'H':
      return 'Masculino';
    case 'M':
      return 'Femenino';
    default:
      return null;
  }
}

/**
 * Validates a CURP, in the order the backend checks it.
 *
 * An empty value is not an error: the field is optional. The checks stop at the
 * first failure, because the backend collapses all of them into one sentence;
 * `motivos` keeps the reason the first one failed so a test can tell a bad date
 * from a bad check digit.
 */
export function validarCurp(valor: string): { valida: boolean; motivos: readonly MotivoCurp[] } {
  const curp = normalizarCurp(valor);
  if (curp === '') {
    return { valida: true, motivos: [] };
  }

  if (curp.length !== 18) {
    return { valida: false, motivos: ['longitud'] };
  }
  if (!PATRON.test(curp)) {
    return { valida: false, motivos: ['formato'] };
  }
  if (!ENTIDADES.includes(curp.slice(11, 13))) {
    return { valida: false, motivos: ['entidad'] };
  }

  const nacimiento = curpFechaNacimiento(curp);
  if (nacimiento === null || nacimiento > hoyLocal()) {
    return { valida: false, motivos: ['fecha'] };
  }

  const digito = calcularDigitoVerificador(curp.slice(0, 17));
  if (digito === null || digito !== Number(curp[17])) {
    return { valida: false, motivos: ['digito'] };
  }

  return { valida: true, motivos: [] };
}

/** Employee number: required, at most twenty characters. */
export function validarNumEmpleado(valor: string): string | null {
  const limpio = normalizarMayusculas(valor);
  if (limpio === '') {
    return 'El número de empleado es obligatorio.';
  }
  if (limpio.length > 20) {
    return 'El número de empleado no puede superar los 20 caracteres.';
  }
  return null;
}

/** Full name: required, at most a hundred and fifty characters. */
export function validarNombre(valor: string): string | null {
  const limpio = valor.trim();
  if (limpio === '') {
    return 'El nombre es obligatorio.';
  }
  if (limpio.length > 150) {
    return 'El nombre no puede superar los 150 caracteres.';
  }
  return null;
}

/**
 * Institutional email: required, bounded, with the shape of an address, and on
 * one of the institutional domains.
 *
 * The backend lower-cases the address before comparing, so the domain check is
 * case-insensitive here too: `Persona@UTN.edu.mx` is accepted and normalised
 * before it travels.
 */
export function validarCorreo(valor: string): string | null {
  const limpio = valor.trim();
  if (limpio === '') {
    return 'El correo institucional es obligatorio.';
  }
  if (limpio.length > 150) {
    return 'El correo institucional no puede superar los 150 caracteres.';
  }
  if (!CORREO.test(limpio)) {
    return 'Escribe un correo con formato válido.';
  }

  const dominio = limpio.slice(limpio.lastIndexOf('@') + 1).toLowerCase();
  if (!DOMINIOS_INSTITUCIONALES.includes(dominio)) {
    // The backend's own sentence for this rule, verbatim.
    return 'El correo debe pertenecer al dominio institucional.';
  }

  return null;
}

/** Lower-cases the address the way the backend normalises it. */
export function normalizarCorreo(valor: string): string {
  return valor.trim().toLowerCase();
}

/**
 * `YYYY-MM-DD` that is a real day and, when asked, not in the future.
 *
 * An empty value is not an error here: several of these fields are optional,
 * and requiring one is the job of the step that asks for it.
 */
export function validarFecha(valor: string, opciones: { noFutura?: boolean } = {}): string | null {
  const limpio = valor.trim();
  if (limpio === '') {
    return null;
  }

  const partes = FECHA.exec(limpio);
  if (partes === null) {
    return 'La fecha no es válida.';
  }

  const anio = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  if (!esFechaReal(anio, mes, dia)) {
    return 'La fecha no es válida.';
  }
  if (opciones.noFutura === true && limpio > hoyLocal()) {
    return 'La fecha no puede ser futura.';
  }

  return null;
}

/**
 * Start of the post against the entry to the government.
 *
 * The two dates are compared only when both exist: the entry is optional, and a
 * post cannot start before the worker entered the institution.
 */
export function validarInicioPuesto(inicio: string, ingreso: string): string | null {
  const desde = inicio.trim();
  const entrada = ingreso.trim();
  if (desde === '' || entrada === '') {
    return null;
  }
  // Both are `YYYY-MM-DD`, so the alphabetical order is the chronological one.
  if (desde < entrada) {
    return 'La fecha de inicio en el puesto no puede ser anterior al ingreso al gobierno.';
  }
  return null;
}

/** Generation: `AAAA-AAAA`, and the end never before the start. */
export function validarGeneracion(valor: string): string | null {
  const limpio = valor.trim();
  if (limpio === '') {
    return null;
  }
  if (!GENERACION.test(limpio)) {
    return 'La generación debe tener el formato AAAA-AAAA.';
  }

  const [inicio, fin] = limpio.split('-').map(Number);
  if (fin < inicio) {
    return 'El año final de la generación no puede ser anterior al inicial.';
  }
  return null;
}

/** Years of experience: a whole number between 0 and 100, when declared. */
export function validarAniosExperiencia(valor: number | null): string | null {
  if (valor === null) {
    return null;
  }
  if (!Number.isInteger(valor) || valor < 0 || valor > 100) {
    return 'Los años de experiencia deben ser un número entero entre 0 y 100.';
  }
  return null;
}

/** Length of an optional text, measured the way it will travel: trimmed. */
export function validarLargo(valor: string, max: number): string | null {
  if (valor.trim().length > max) {
    return `El texto no puede superar los ${max} caracteres.`;
  }
  return null;
}

/**
 * Whether a category can be held by a post.
 *
 * The two types have to be the same one; the backend answers `422` otherwise.
 * `false` while either side is missing, because there is no pair to compare.
 */
export function categoriaCompatible(
  categoriaId: number | null,
  puesto: PuestoCatalogo | null,
  categorias: readonly CategoriaCctCatalogo[],
): boolean {
  if (categoriaId === null || puesto === null) {
    return false;
  }

  const categoria = categorias.find((entrada) => entrada.id === categoriaId);
  return categoria !== undefined && categoria.tipo === puesto.tipo_puesto;
}

/**
 * What `trabaja_otro_donde` has to be, given the answer above it.
 *
 * `Publico` and `Privado` make the detail required; `No` makes it prohibited,
 * so it must not travel at all. Any other answer leaves it optional.
 */
export function trabajaOtroDondeRequerido(
  trabajaOtroLugar: string,
): 'requerido' | 'prohibido' | 'opcional' {
  const valor = trabajaOtroLugar.trim();
  if (valor === 'No') {
    return 'prohibido';
  }
  if (valor === 'Publico' || valor === 'Privado') {
    return 'requerido';
  }
  return 'opcional';
}
