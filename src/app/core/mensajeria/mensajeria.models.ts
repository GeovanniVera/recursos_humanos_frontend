export type ModoDestinatarios = 'todos' | 'area' | 'categoria_cct';

export type EstatusComunicado =
  | 'BORR'
  | 'PEND_AUT'
  | 'RECHAZADO'
  | 'EN_COLA'
  | 'ENVIANDO'
  | 'COMPLET'
  | 'ENVIADO_PARCIAL'
  | 'FALLIDO';

export type CategoriaCctTipo = 'administrativo' | 'docente' | 'mando_medio_superior';

export type FiltroBandejaComunicados = 'pendientes' | 'aprobados' | 'rechazados' | 'borradores';

export interface AreaSegmento {
  id: number;
  nombre: string;
  count: number;
}

export interface CategoriaSegmento {
  tipo: CategoriaCctTipo;
  nombre: string;
  count: number;
}

export interface SegmentacionResumen {
  total_activos: number;
  areas: AreaSegmento[];
  categorias_cct: CategoriaSegmento[];
}

export interface EmpleadoSegmento {
  id: number;
  num_empleado: string;
  nombre: string;
  correo_institucional: string;
  area: string | null;
  categoria: string | null;
}

export interface FiltrosComunicado {
  area_ids: number[];
  categorias_tipo: CategoriaCctTipo[];
  empleado_ids_extra: number[];
}

export interface ComunicadoArchivo {
  id: number;
  comunicado_id: number;
  nombre_original: string;
  mime_type: string;
  tamano_bytes: number;
  es_imagen: boolean;
  embebido_en_cuerpo: boolean;
  url_descarga: string;
  fecha_subida: string | null;
}

export interface ComunicadoDto {
  id: number;
  folio: string | null;
  asunto: string;
  contenido_html: string;
  modo_destinatarios: ModoDestinatarios;
  filtros_json: FiltrosComunicado;
  status: EstatusComunicado;
  status_etiqueta: string;
  es_editable: boolean;
  total_destinatarios: number;
  enviados: number;
  fallidos: number;
  feedback_rechazo: string | null;
  autor: {
    usuario_id: number;
    nombre: string;
  };
  autorizador: {
    usuario_id: number;
    nombre: string;
  } | null;
  archivos?: ComunicadoArchivo[];
  fecha_creacion: string | null;
  fecha_solicitud: string | null;
  fecha_resolucion: string | null;
  fecha_completado: string | null;
}

export interface ComunicadoConteos {
  pendientes: number;
  aprobados: number;
  rechazados: number;
  borradores: number;
}

export interface ListadoComunicadosResponse {
  comunicados: ComunicadoDto[];
  conteos: ComunicadoConteos;
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export interface GuardarComunicadoPayload {
  asunto: string;
  contenido_html: string;
  modo_destinatarios: ModoDestinatarios;
  filtros: FiltrosComunicado;
}

export interface DestinatarioMuestra {
  empleado_id: number;
  correo_destino: string;
  nombre_destino: string;
  area_nombre: string;
  categoria_nombre: string;
  numero_empleado: string;
}

export interface PrevisualizarDestinatariosResponse {
  total: number;
  muestra: DestinatarioMuestra[];
  destinatarios?: DestinatarioMuestra[];
}
