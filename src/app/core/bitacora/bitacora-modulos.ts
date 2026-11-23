/**
 * Catálogo legible de módulos de la bitácora.
 *
 * El backend guarda códigos (`expediente`) y el filtro de módulo era texto
 * libre. Este catálogo da al auditor nombres reconocibles y deja abierta la
 * puerta a códigos nuevos: si la URL trae uno fuera de la lista, la pantalla lo
 * muestra como opción «Código: …» en vez de descartarlo.
 */
export interface ModuloBitacora {
  codigo: string;
  etiqueta: string;
}

export const CATALOGO_MODULOS_BITACORA: readonly ModuloBitacora[] = [
  { codigo: 'expediente', etiqueta: 'Expediente' },
  { codigo: 'empleados', etiqueta: 'Empleados' },
  { codigo: 'catalogos', etiqueta: 'Catálogos' },
  { codigo: 'bitacora', etiqueta: 'Bitácora' },
  { codigo: 'mensajeria', etiqueta: 'Mensajería' },
  { codigo: 'autorizaciones', etiqueta: 'Autorizaciones' },
  { codigo: 'semaforo', etiqueta: 'Semáforo' },
  { codigo: 'dashboard', etiqueta: 'Panel' },
];

export function esModuloConocido(codigo: string): boolean {
  return CATALOGO_MODULOS_BITACORA.some((modulo) => modulo.codigo === codigo);
}

export function etiquetaModulo(codigo: string): string {
  const modulo = CATALOGO_MODULOS_BITACORA.find((item) => item.codigo === codigo);
  if (modulo) return modulo.etiqueta;
  const palabras = codigo.split(/[._-]+/).filter(Boolean);
  if (palabras.length === 0) return 'Sin módulo';
  const legible = palabras.join(' ');
  return legible.charAt(0).toUpperCase() + legible.slice(1);
}
