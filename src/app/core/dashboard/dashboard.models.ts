/**
 * Payloads of `GET /dashboard/resumen` and `GET /dashboard/analitica`.
 */

/** Counters of the general panel. */
export interface ResumenDashboard {
  empleados_activos: number;
  empleados_baja: number;
  expedientes_completos: number;
}

export interface ResumenDashboardResponse {
  datos: ResumenDashboard;
}

export interface ConteoEtiqueta {
  etiqueta: string;
  total: number;
}

export interface SerieMensualItem {
  mes: string;
  altas: number;
  bajas: number;
}

export interface PlantillaAnalitica {
  activos: number;
  en_licencia: number;
  bajas_definitivas: number;
  porcentaje_completitud: number;
  con_empleo_externo_vigente: number;
  antiguedad_promedio_anios: number;
  por_categoria_cct: ConteoEtiqueta[];
  por_tipo_personal: ConteoEtiqueta[];
  por_jornada: ConteoEtiqueta[];
  por_sexo: ConteoEtiqueta[];
  top_areas: ConteoEtiqueta[];
}

export interface SemaforoAnalitica {
  completos: number;
  casi_completos: number;
  incompletos: number;
  sin_curp: number;
  sin_grado_maximo: number;
  por_nivel_estudios: ConteoEtiqueta[];
}

export interface MovimientosAnalitica {
  altas_mes: number;
  bajas_mes: number;
  cambios_adscripcion_90d: number;
  serie_mensual: SerieMensualItem[];
  motivos_baja: ConteoEtiqueta[];
}

export interface ComunicacionAnalitica {
  pendientes_autorizacion: number;
  enviados_mes: number;
  destinatarios_mes: number;
  por_estatus: ConteoEtiqueta[];
}

export interface SeguridadAnalitica {
  usuarios_activos: number;
  usuarios_suspendidos: number;
  eventos_fallidos_7d: number;
  usuarios_por_rol: ConteoEtiqueta[];
  bitacora_por_modulo_30d: ConteoEtiqueta[];
}

export interface AnaliticaDashboard {
  plantilla: PlantillaAnalitica;
  semaforo: SemaforoAnalitica;
  movimientos: MovimientosAnalitica;
  comunicacion: ComunicacionAnalitica;
  seguridad: SeguridadAnalitica | null;
}

export interface AnaliticaDashboardResponse {
  datos: AnaliticaDashboard;
}

export interface ResumenDashboardError {
  message?: string;
  codigo?: string;
}
