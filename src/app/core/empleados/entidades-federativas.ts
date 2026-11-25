/**
 * One federative entity of birth.
 *
 * `clave` is the two-character code RENAPO writes at positions 12 and 13 of the
 * CURP, plus `NE` for a birth abroad. The registration sends the key, never the
 * name: a local map of code to name would be a second copy of the catalogue, and
 * the copy that drifts is always the one nobody validates.
 *
 * The shape lives here, with the table, and not in `alta.models.ts`: this module
 * must stand alone so the frozen standard can be reviewed, tested and deleted
 * without dragging the API contract along. The models import the type from here.
 */
export interface EntidadCatalogo {
  clave: string;
  nombre: string;
}

/**
 * The 33 federative entities of the RENAPO catalogue, frozen.
 *
 * This is a national standard, not mutable business data: the keys are the two
 * characters RENAPO writes at positions 12 and 13 of every CURP, and no screen
 * of this system can edit them. The table exists here for one reason only: the
 * live `GET /api/empleados/formulario` does not send `entidades` yet, so the
 * field that shows the entity of birth had no name to print next to a key the
 * CURP was already carrying, and stayed blank in production while the tests
 * passed against a fixture that invented the catalog.
 *
 * It is a temporary display fallback, never a source of truth. **Delete this
 * file once the endpoint returns the catalog**: two copies of the same standard,
 * one of them frozen inside a bundle, is exactly the drift that makes a client
 * disagree with its server, and the server copy is the only one that can be
 * corrected.
 *
 * `DF` is the historical key of Ciudad de México and must not be renamed: the
 * CURP of someone born in the capital carries `DF` even though the catalog names
 * it «Ciudad de México».
 */
export const ENTIDADES_FEDERATIVAS: readonly EntidadCatalogo[] = [
  { clave: 'AS', nombre: 'Aguascalientes' },
  { clave: 'BC', nombre: 'Baja California' },
  { clave: 'BS', nombre: 'Baja California Sur' },
  { clave: 'CC', nombre: 'Campeche' },
  { clave: 'CL', nombre: 'Coahuila' },
  { clave: 'CM', nombre: 'Colima' },
  { clave: 'CS', nombre: 'Chiapas' },
  { clave: 'CH', nombre: 'Chihuahua' },
  { clave: 'DF', nombre: 'Ciudad de México' },
  { clave: 'DG', nombre: 'Durango' },
  { clave: 'GT', nombre: 'Guanajuato' },
  { clave: 'GR', nombre: 'Guerrero' },
  { clave: 'HG', nombre: 'Hidalgo' },
  { clave: 'JC', nombre: 'Jalisco' },
  { clave: 'MC', nombre: 'Estado de México' },
  { clave: 'MN', nombre: 'Michoacán' },
  { clave: 'MS', nombre: 'Morelos' },
  { clave: 'NT', nombre: 'Nayarit' },
  { clave: 'NL', nombre: 'Nuevo León' },
  { clave: 'OC', nombre: 'Oaxaca' },
  { clave: 'PL', nombre: 'Puebla' },
  { clave: 'QT', nombre: 'Querétaro' },
  { clave: 'QR', nombre: 'Quintana Roo' },
  { clave: 'SP', nombre: 'San Luis Potosí' },
  { clave: 'SL', nombre: 'Sinaloa' },
  { clave: 'SR', nombre: 'Sonora' },
  { clave: 'TC', nombre: 'Tabasco' },
  { clave: 'TS', nombre: 'Tamaulipas' },
  { clave: 'TL', nombre: 'Tlaxcala' },
  { clave: 'VZ', nombre: 'Veracruz' },
  { clave: 'YN', nombre: 'Yucatán' },
  { clave: 'ZS', nombre: 'Zacatecas' },
  { clave: 'NE', nombre: 'Nacido en el extranjero' },
];
