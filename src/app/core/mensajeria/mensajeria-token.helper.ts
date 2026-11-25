import { StatusPillTone } from '../../shared/ui/status-pill/status-pill.component';
import {
  DestinatarioMuestra,
  EstatusComunicado,
  ModoDestinatarios,
} from './mensajeria.models';

export const MAX_ADJUNTOS_BYTES = 2_097_152; // 2 MB

export interface VariableDinamica {
  readonly token: string;
  readonly etiqueta: string;
  readonly descripcion: string;
}

export const VARIABLES_DINAMICAS: readonly VariableDinamica[] = [
  {
    token: '{{nombre_empleado}}',
    etiqueta: 'Nombre completo',
    descripcion: 'Nombre completo de cada trabajador',
  },
  {
    token: '{{categoria_cct}}',
    etiqueta: 'Tipo de personal',
    descripcion: 'Administrativo, Docente o Mando Medio y Superior',
  },
  {
    token: '{{area}}',
    etiqueta: 'Área o departamento',
    descripcion: 'Área de adscripción del trabajador',
  },
  {
    token: '{{numero_empleado}}',
    etiqueta: 'Número de empleado',
    descripcion: 'Clave institucional del servidor público',
  },
];

const ETIQUETA_POR_TOKEN: Readonly<Record<string, string>> = {
  '{{nombre_empleado}}': 'Nombre completo',
  '{{categoria_cct}}': 'Tipo de personal',
  '{{tipo_personal}}': 'Tipo de personal',
  '{{area}}': 'Área o departamento',
  '{{numero_empleado}}': 'Número de empleado',
};

export function esRolAutorizador(rol: string | null | undefined): boolean {
  const clave = (rol ?? '').trim().toUpperCase();
  return clave === 'SUPER_ADMIN' || clave === 'SISTEMAS';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function normalizarFichasEditorHtml(rawHtml: string): string {
  let html = rawHtml.replace(
    /<span[^>]*data-var="([^"]+)"[^>]*>.*?<\/span>/gi,
    (_match, token: string) => {
      const etiqueta = ETIQUETA_POR_TOKEN[token] ?? token;
      return `<span contenteditable="false" data-var="${escapeHtml(token)}" class="var-token">${escapeHtml(etiqueta)}</span>`;
    },
  );

  for (const [token, etiqueta] of Object.entries(ETIQUETA_POR_TOKEN)) {
    const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<!data-var=")${escapedToken}`, 'g');
    html = html.replace(
      regex,
      `<span contenteditable="false" data-var="${escapeHtml(token)}" class="var-token">${escapeHtml(etiqueta)}</span>`,
    );
  }

  return html;
}

export function reemplazarVariablesTexto(
  rawText: string,
  muestra: Partial<DestinatarioMuestra>,
): string {
  const nombre = muestra.nombre_destino ?? 'María Elena López Hernández';
  const categoria = muestra.categoria_nombre ?? 'Administrativos';
  const area = muestra.area_nombre ?? 'Recursos Humanos';
  const numero = muestra.numero_empleado ?? 'EMP-1001';

  return rawText
    .replace(/\{\{nombre_empleado\}\}/g, nombre)
    .replace(/\{\{categoria_cct\}\}/g, categoria)
    .replace(/\{\{tipo_personal\}\}/g, categoria)
    .replace(/\{\{area\}\}/g, area)
    .replace(/\{\{numero_empleado\}\}/g, numero);
}

export function reemplazarVariablesHtmlPreview(
  rawHtml: string,
  muestra: Partial<DestinatarioMuestra>,
  imageUrlsById?: ReadonlyMap<number, string>,
): string {
  const nombre = escapeHtml(muestra.nombre_destino ?? 'María Elena López Hernández');
  const categoria = escapeHtml(muestra.categoria_nombre ?? 'Administrativos');
  const area = escapeHtml(muestra.area_nombre ?? 'Recursos Humanos');
  const numero = escapeHtml(muestra.numero_empleado ?? 'EMP-1001');

  let html = rawHtml.replace(/<span[^>]*data-var="([^"]+)"[^>]*>.*?<\/span>/gi, '$1');

  html = html
    .replace(/\{\{nombre_empleado\}\}/g, `<strong>${nombre}</strong>`)
    .replace(/\{\{categoria_cct\}\}/g, `<strong>${categoria}</strong>`)
    .replace(/\{\{tipo_personal\}\}/g, `<strong>${categoria}</strong>`)
    .replace(/\{\{area\}\}/g, `<strong>${area}</strong>`)
    .replace(/\{\{numero_empleado\}\}/g, `<strong>${numero}</strong>`);

  if (imageUrlsById && imageUrlsById.size > 0) {
    html = html.replace(
      /<img([^>]*?)data-att-id="(\d+)"([^>]*?)>/gi,
      (match, before: string, idStr: string, after: string) => {
        const url = imageUrlsById.get(Number(idStr));
        if (!url) {
          return match;
        }
        const cleaned = `${before} ${after}`.replace(/\ssrc="[^"]*"/gi, '');
        return `<img src="${escapeHtml(url)}" data-att-id="${idStr}" ${cleaned.trim()}>`;
      },
    );
  }

  return html;
}

export function statusPillTone(status: EstatusComunicado): StatusPillTone {
  switch (status) {
    case 'COMPLET':
      return 'completo';
    case 'PEND_AUT':
    case 'EN_COLA':
    case 'ENVIANDO':
    case 'ENVIADO_PARCIAL':
      return 'casi_completo';
    case 'RECHAZADO':
    case 'FALLIDO':
      return 'incompleto';
    default:
      return 'activo';
  }
}

export function etiquetaModo(modo: ModoDestinatarios): string {
  switch (modo) {
    case 'todos':
      return 'Todos los empleados';
    case 'area':
      return 'Área / Departamento';
    case 'categoria_cct':
      return 'Tipo de Personal';
  }
}

export function fechaCorta(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    return '—';
  }
  return fecha.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
