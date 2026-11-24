import { EstadoExpediente } from '../empleados/ficha.models';
import { PadronMeta, PadronEnlaces } from '../padron/padron.models';

export type { EstadoExpediente };
export type OrdenSemaforo = 'num_empleado' | 'nombre' | 'estado' | 'campos_faltantes';
export type DireccionSemaforo = 'asc' | 'desc';

export interface ConsultaSemaforo {
  buscar?: string;
  estado?: EstadoExpediente;
  pagina?: number;
  por_pagina?: number;
  ordenar_por?: OrdenSemaforo;
  direccion?: DireccionSemaforo;
}

export interface ResumenSemaforo {
  estado: EstadoExpediente;
  porcentaje: number;
  total_campos: number;
  campos_completos: number;
  campos_faltantes: number;
}

export interface EmpleadoSemaforo {
  id: number;
  num_empleado: string;
  nombre: string;
  area: { id: number; nombre: string } | null;
  puesto: { id: number; nombre: string } | null;
  semaforo: ResumenSemaforo;
}

export interface ContadoresSemaforo {
  total_evaluados: number;
  completos: number;
  casi_completos: number;
  incompletos: number;
}

export interface SemaforoResponse {
  datos: EmpleadoSemaforo[];
  contadores: ContadoresSemaforo;
  meta: PadronMeta;
  enlaces: PadronEnlaces;
}

export type GrupoRecordatorioLote = 'incompleto' | 'casi_completo' | 'todos';

export interface CooldownLoteEstado {
  ultimo_envio_at: string | null;
  en_cooldown: boolean;
  disponible_desde: string | null;
  segundos_restantes: number;
}

export interface ConfigRecordatoriosSemaforo {
  activo: boolean;
  dias_incompleto: number;
  dias_casi_completo: number;
  cooldown_manual_horas: number;
  asunto_incompleto: string;
  mensaje_incompleto: string;
  asunto_casi_completo: string;
  mensaje_casi_completo: string;
  ultima_ejecucion_auto_at: string | null;
  lotes: {
    incompleto: CooldownLoteEstado;
    casi_completo: CooldownLoteEstado;
  };
}

export interface EstadoRecordatorioEmpleado {
  empleado_id: number;
  tiene_correo: boolean;
  correo_institucional: string | null;
  estado_expediente: EstadoExpediente;
  ultimo_envio_at: string | null;
  ultimo_envio_manual_at: string | null;
  ultimo_tipo: 'auto' | 'manual' | 'lote' | null;
  proximo_envio_at: string | null;
  auto_segundos_restantes: number | null;
  manual_en_cooldown: boolean;
  manual_disponible_desde: string | null;
  manual_segundos_restantes: number;
}

export interface EstadoRecordatoriosResponse {
  datos: {
    config: ConfigRecordatoriosSemaforo;
    empleados: Record<string, EstadoRecordatorioEmpleado>;
  };
}

export interface ActualizarConfigRecordatoriosPayload {
  activo: boolean;
  dias_incompleto: number;
  dias_casi_completo: number;
  asunto_incompleto: string;
  mensaje_incompleto: string;
  asunto_casi_completo: string;
  mensaje_casi_completo: string;
}

export interface EnvioRecordatorioHistorial {
  id: number;
  empleado_id: number;
  empleado_nombre: string | null;
  num_empleado: string | null;
  usuario_nombre: string | null;
  origen: 'automatico' | 'manual' | 'lote';
  estado_expediente: 'casi_completo' | 'incompleto';
  campos_faltantes_count: number;
  campos_faltantes: string[];
  correo_destino: string;
  asunto: string;
  status: 'enviado' | 'fallido';
  error_detalle: string | null;
  fecha_envio: string | null;
}

export interface HistorialRecordatoriosResponse {
  datos: EnvioRecordatorioHistorial[];
  meta: {
    pagina: number;
    por_pagina: number;
    total: number;
    total_paginas: number;
  };
}
