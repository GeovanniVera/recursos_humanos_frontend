/**
 * Catálogo legible de acciones de la bitácora.
 *
 * El backend guarda códigos (`empleado.baja`) y el listado no trae etiqueta.
 * Este catálogo es la capa que la secretaría necesita para filtrar por nombre
 * en lugar de recordar el código. Está agrupado por módulo para que el selector
 * no sea una lista larga y plana.
 *
 * Si llega un código nuevo desde la API o desde la URL, la pantalla lo agrega
 * como opción «Código: …» sin perder el filtro: el catálogo es una ayuda, no un
 * candado.
 */
export interface AccionBitacora {
  codigo: string;
  etiqueta: string;
}

export interface GrupoAccionesBitacora {
  modulo: string;
  acciones: readonly AccionBitacora[];
}

export const CATALOGO_ACCIONES_BITACORA: readonly GrupoAccionesBitacora[] = [
  {
    modulo: 'Empleados',
    acciones: [
      { codigo: 'empleado.alta', etiqueta: 'Alta de empleado' },
      { codigo: 'empleado.baja', etiqueta: 'Baja de empleado' },
      { codigo: 'empleado.edicion', etiqueta: 'Edición de empleado' },
      { codigo: 'empleado.reactivacion', etiqueta: 'Reactivación de empleado' },
      { codigo: 'empleado.reingreso', etiqueta: 'Reingreso de empleado' },
      { codigo: 'empleado.adscripcion', etiqueta: 'Cambio de adscripción de empleado' },
    ],
  },
  {
    modulo: 'Bitácora',
    acciones: [{ codigo: 'bitacora.acceso_denegado', etiqueta: 'Acceso denegado' }],
  },
];

export function esAccionConocida(codigo: string): boolean {
  return CATALOGO_ACCIONES_BITACORA.some((grupo) =>
    grupo.acciones.some((accion) => accion.codigo === codigo),
  );
}

/** Etiqueta del catálogo, o una versión legible de un código que aún no esté en él. */
export function etiquetaAccion(codigo: string): string {
  for (const grupo of CATALOGO_ACCIONES_BITACORA) {
    const accion = grupo.acciones.find((item) => item.codigo === codigo);
    if (accion) return accion.etiqueta;
  }
  const palabras = codigo.split(/[._-]+/).filter(Boolean);
  if (palabras.length === 0) return 'Sin acción';
  const legible = palabras.join(' ');
  return legible.charAt(0).toUpperCase() + legible.slice(1);
}
