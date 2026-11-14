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
