/**
 * Human-readable Spanish labels for mandatory employee dossier fields.
 *
 * Mirrors `Empleado::CAMPOS_EXPEDIENTE` in the backend so missing-field chips in
 * `FichaDrawer` and fallbacks in `FaltantesDrawer` present identical copy.
 */
export const ETIQUETAS_CAMPO_EXPEDIENTE: Readonly<Record<string, string>> = {
  curp: 'CURP',
  fecha_nacimiento: 'Fecha de nacimiento',
  sexo: 'Sexo',
  estado_civil: 'Estado civil',
  estado_civil_id: 'Estado civil',
  municipio: 'Municipio',
  area: 'Adscripción',
  area_id: 'Adscripción',
  puesto: 'Plaza o puesto',
  puesto_id: 'Plaza o puesto',
  categoria_cct: 'Categoría CCT',
  categoria_cct_id: 'Categoría CCT',
  tipo_personal: 'Tipo de personal',
  tipo_jornada: 'Tipo de jornada',
  correo_institucional: 'Correo institucional',
  nivel_estudios: 'Nivel de estudios',
  nivel_estudios_id: 'Nivel de estudios',
  fecha_inicio_puesto: 'Fecha de inicio en el puesto',
  fecha_ingreso_gobierno: 'Fecha de ingreso al gobierno',
  escuela_procedencia: 'Escuela de procedencia',
  generacion: 'Generación',
  exp_publico_anios: 'Años de experiencia en el sector público',
  exp_privado_anios: 'Años de experiencia en el sector privado',
  trabaja_otro_lugar: 'Trabaja en otro lugar',
};

/**
 * Resolves a backend missing-field key (`curp`, `fecha_nacimiento`, ...) to a
 * readable Spanish label, falling back cleanly if an unknown key arrives.
 */
export function etiquetaCampoExpediente(campo: string): string {
  const key = campo.trim();
  if (!key) {
    return campo;
  }
  const known = ETIQUETAS_CAMPO_EXPEDIENTE[key];
  if (known !== undefined) {
    return known;
  }
  const normalized = key.replace(/_/g, ' ');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
