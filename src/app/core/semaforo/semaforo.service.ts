import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ActualizarConfigRecordatoriosPayload,
  ConfigRecordatoriosSemaforo,
  ConsultaSemaforo,
  EnvioRecordatorioHistorial,
  EstadoRecordatorioEmpleado,
  EstadoRecordatoriosResponse,
  GrupoRecordatorioLote,
  HistorialRecordatoriosResponse,
  SemaforoResponse,
} from './semaforo.models';

/** Only the wire contract. Authentication belongs to the existing interceptor. */
@Injectable({ providedIn: 'root' })
export class SemaforoService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/semaforo`;
  private readonly recordatoriosUrl = `${this.url}/recordatorios`;

  consultar(consulta: ConsultaSemaforo = {}): Observable<SemaforoResponse> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(consulta)) {
      if (value === undefined) continue;
      const normalized = typeof value === 'string' ? value.trim() : value;
      if (normalized === '') continue;
      params = params.set(key, normalized);
    }
    return this.http.get<SemaforoResponse>(this.url, { params });
  }

  obtenerEstadoRecordatorios(empleadoIds: readonly number[]): Observable<EstadoRecordatoriosResponse> {
    let params = new HttpParams();
    if (empleadoIds.length > 0) {
      params = params.set('empleado_ids', empleadoIds.join(','));
    }
    return this.http.get<EstadoRecordatoriosResponse>(`${this.recordatoriosUrl}/estado`, { params });
  }

  actualizarConfigRecordatorios(
    payload: ActualizarConfigRecordatoriosPayload,
  ): Observable<{ datos: ConfigRecordatoriosSemaforo }> {
    return this.http.put<{ datos: ConfigRecordatoriosSemaforo }>(
      `${this.recordatoriosUrl}/configuracion`,
      payload,
    );
  }

  enviarRecordatorioIndividual(empleadoId: number): Observable<{
    datos: {
      envio: EnvioRecordatorioHistorial;
      empleado_estado: EstadoRecordatorioEmpleado;
    };
  }> {
    return this.http.post<{
      datos: {
        envio: EnvioRecordatorioHistorial;
        empleado_estado: EstadoRecordatorioEmpleado;
      };
    }>(`${this.recordatoriosUrl}/enviar`, { empleado_id: empleadoId });
  }

  enviarRecordatorioLote(estado: GrupoRecordatorioLote): Observable<{
    datos: {
      enviados: number;
      fallidos: number;
      omitidos_sin_correo: number;
      omitidos_cooldown: number;
      config: ConfigRecordatoriosSemaforo;
    };
  }> {
    return this.http.post<{
      datos: {
        enviados: number;
        fallidos: number;
        omitidos_sin_correo: number;
        omitidos_cooldown: number;
        config: ConfigRecordatoriosSemaforo;
      };
    }>(`${this.recordatoriosUrl}/enviar-lote`, { estado });
  }

  consultarHistorialRecordatorios(filtros: {
    estado_expediente?: 'incompleto' | 'casi_completo';
    origen?: 'automatico' | 'manual' | 'lote';
    pagina?: number;
    por_pagina?: number;
  } = {}): Observable<HistorialRecordatoriosResponse> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filtros)) {
      if (value === undefined) continue;
      params = params.set(key, String(value));
    }
    return this.http.get<HistorialRecordatoriosResponse>(`${this.recordatoriosUrl}/historial`, {
      params,
    });
  }
}
