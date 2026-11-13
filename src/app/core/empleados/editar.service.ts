import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { PadronMeta } from '../padron/padron.models';
import { FichaEmpleadoResponse } from './ficha.models';

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

/**
 * The only `campo` values `GET /api/empleados/{id}/informacion-historial` accepts.
 *
 * The endpoint filters by an enum of exactly these three, and anything else — a
 * fourth field, a typo, one of the other editable ones — is answered with a
 * `422`, never with an empty list. That is why the panel is typed against this
 * union instead of the editable fields: a request for `observaciones` fails to
 * compile here, which is what keeps an unsupported panel from being mounted at
 * all. A convention would have let six of them through.
 */
export const CAMPOS_CON_HISTORIAL = [
  'nivel_estudios_id',
  'escuela_procedencia',
  'generacion',
] as const;
export type CampoConHistorial = (typeof CAMPOS_CON_HISTORIAL)[number];

/**
 * One recorded move of a field.
 *
 * `valor_anterior` and `valor_nuevo` are the readable strings the backend
 * resolved (`"Sin dato"` when empty) and are meant to be printed as they arrive.
 * They describe a past value only: they are never used to refill the form.
 */
export interface MovimientoCampo {
  id: number;
  campo: CampoConHistorial;
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
  historialCampo(id: number, campo: CampoConHistorial, pagina = 1) {
    return this.http.get<HistoriaCampo>(`${this.url}/${id}/informacion-historial`, {
      params: new HttpParams().set('campo', campo).set('pagina', pagina).set('por_pagina', 5),
    });
  }
}
