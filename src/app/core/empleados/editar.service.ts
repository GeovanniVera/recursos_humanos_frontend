import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { FichaEmpleadoResponse } from './ficha.models';
import { PadronMeta } from '../padron/padron.models';

export const CAMPOS_EDITABLES = [
  'estado_civil_id',
  'nivel_estudios_id',
  'escuela_procedencia',
  'generacion',
  'exp_publico_anios',
  'exp_privado_anios',
  'trabaja_otro_lugar',
  'trabaja_otro_donde',
  'observaciones',
] as const;
export type CampoEditable = (typeof CAMPOS_EDITABLES)[number];
export type EdicionEmpleado = Record<CampoEditable, string | number | null>;
export interface MovimientoInformacion {
  id: number;
  seccion: 'estudios' | 'experiencia';
  antes: Record<string, string | number | null>;
  despues: Record<string, string | number | null>;
  responsable: string;
  fecha: string;
}
export interface HistoriaInformacion {
  datos: MovimientoInformacion[];
  meta: PadronMeta;
}
export interface MovimientoCampo {
  id: number;
  campo: CampoEditable;
  antes: string | number | boolean | null;
  despues: string | number | boolean | null;
  valor_anterior: string;
  valor_nuevo: string;
  fecha: string;
  responsable: string;
}
export interface HistoriaCampo {
  datos: MovimientoCampo[];
  meta: PadronMeta;
}

@Injectable({ providedIn: 'root' })
export class EditarEmpleadoService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/empleados`;
  consultar(id: number) {
    return this.http.get<FichaEmpleadoResponse>(`${this.url}/${id}`);
  }
  actualizar(id: number, datos: EdicionEmpleado) {
    return this.http.patch<FichaEmpleadoResponse>(`${this.url}/${id}`, datos);
  }
  historial(id: number, pagina = 1) {
    return this.http.get<HistoriaInformacion>(`${this.url}/${id}/informacion-historial`, {
      params: new HttpParams().set('pagina', pagina).set('por_pagina', 10),
    });
  }
  historialCampo(id: number, campo: CampoEditable, pagina = 1) {
    return this.http.get<HistoriaCampo>(`${this.url}/${id}/informacion-historial`, {
      params: new HttpParams().set('campo', campo).set('pagina', pagina).set('por_pagina', 5),
    });
  }
}
