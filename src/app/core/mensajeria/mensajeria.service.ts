import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ComunicadoArchivo,
  ComunicadoConteos,
  ComunicadoDto,
  FiltroBandejaComunicados,
  GuardarComunicadoPayload,
  ListadoComunicadosResponse,
  ModoDestinatarios,
  FiltrosComunicado,
  PrevisualizarDestinatariosResponse,
  SegmentacionResumen,
  EmpleadoSegmento,
} from './mensajeria.models';

const CONTEOS_VACIOS: ComunicadoConteos = {
  pendientes: 0,
  aprobados: 0,
  rechazados: 0,
  borradores: 0,
};

@Injectable({ providedIn: 'root' })
export class MensajeriaService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/mensajeria`;
  private readonly nuevoCorreoTick = signal(0);
  private readonly conteosState = signal<ComunicadoConteos>(CONTEOS_VACIOS);
  readonly nuevoCorreoSolicitud = this.nuevoCorreoTick.asReadonly();
  readonly conteos = this.conteosState.asReadonly();

  solicitarNuevoCorreo(): void {
    this.nuevoCorreoTick.update((n) => n + 1);
  }

  refrescarConteos(): void {
    this.listarComunicados('pendientes', 1, undefined, 1).subscribe({
      error: () => undefined,
    });
  }

  limpiarConteos(): void {
    this.conteosState.set(CONTEOS_VACIOS);
  }

  resumenSegmentacion(): Observable<SegmentacionResumen> {
    return this.http.get<SegmentacionResumen>(`${this.baseUrl}/segmentacion/resumen`);
  }

  buscarEmpleados(buscar: string): Observable<{ empleados: EmpleadoSegmento[] }> {
    const params = new HttpParams().set('buscar', buscar);
    return this.http.get<{ empleados: EmpleadoSegmento[] }>(
      `${this.baseUrl}/segmentacion/empleados`,
      { params },
    );
  }

  previsualizarDestinatarios(
    modo_destinatarios: ModoDestinatarios,
    filtros: FiltrosComunicado,
  ): Observable<PrevisualizarDestinatariosResponse> {
    return this.http.post<PrevisualizarDestinatariosResponse>(
      `${this.baseUrl}/destinatarios/previsualizar`,
      { modo_destinatarios, filtros },
    );
  }

  listarComunicados(
    estatus?: FiltroBandejaComunicados,
    pagina = 1,
    buscar?: string,
    porPagina = 20,
  ): Observable<ListadoComunicadosResponse> {
    let params = new HttpParams()
      .set('pagina', String(pagina))
      .set('por_pagina', String(porPagina));
    if (estatus) {
      params = params.set('estatus', estatus);
    }
    if (buscar && buscar.trim() !== '') {
      params = params.set('buscar', buscar.trim());
    }
    return this.http
      .get<ListadoComunicadosResponse>(`${this.baseUrl}/comunicados`, { params })
      .pipe(tap((res) => this.conteosState.set(res.conteos)));
  }

  obtenerComunicado(id: number): Observable<{ comunicado: ComunicadoDto }> {
    return this.http.get<{ comunicado: ComunicadoDto }>(`${this.baseUrl}/comunicados/${id}`);
  }

  crearBorrador(
    payload: GuardarComunicadoPayload,
  ): Observable<{ mensaje: string; comunicado: ComunicadoDto }> {
    return this.http.post<{ mensaje: string; comunicado: ComunicadoDto }>(
      `${this.baseUrl}/comunicados`,
      payload,
    );
  }

  actualizarComunicado(
    id: number,
    payload: GuardarComunicadoPayload,
  ): Observable<{ mensaje: string; comunicado: ComunicadoDto }> {
    return this.http.put<{ mensaje: string; comunicado: ComunicadoDto }>(
      `${this.baseUrl}/comunicados/${id}`,
      payload,
    );
  }

  eliminarBorrador(id: number): Observable<{ mensaje: string }> {
    return this.http.delete<{ mensaje: string }>(`${this.baseUrl}/comunicados/${id}`);
  }

  subirAdjunto(
    comunicadoId: number,
    archivo: File,
  ): Observable<{ mensaje: string; archivo: ComunicadoArchivo }> {
    const formData = new FormData();
    formData.append('archivo', archivo);
    return this.http.post<{ mensaje: string; archivo: ComunicadoArchivo }>(
      `${this.baseUrl}/comunicados/${comunicadoId}/adjuntos`,
      formData,
    );
  }

  descargarAdjunto(comunicadoId: number, archivoId: number): Observable<Blob> {
    return this.http.get(
      `${this.baseUrl}/comunicados/${comunicadoId}/adjuntos/${archivoId}`,
      { responseType: 'blob' },
    );
  }

  eliminarAdjunto(comunicadoId: number, archivoId: number): Observable<{ mensaje: string }> {
    return this.http.delete<{ mensaje: string }>(
      `${this.baseUrl}/comunicados/${comunicadoId}/adjuntos/${archivoId}`,
    );
  }

  enviarPrueba(
    comunicadoId: number,
    empleado_muestra_id?: number,
  ): Observable<{ mensaje: string; correo: string }> {
    return this.http.post<{ mensaje: string; correo: string }>(
      `${this.baseUrl}/comunicados/${comunicadoId}/enviar-prueba`,
      empleado_muestra_id !== undefined ? { empleado_muestra_id } : {},
    );
  }

  solicitarAutorizacion(
    comunicadoId: number,
  ): Observable<{ mensaje: string; comunicado: ComunicadoDto }> {
    return this.http.post<{ mensaje: string; comunicado: ComunicadoDto }>(
      `${this.baseUrl}/comunicados/${comunicadoId}/solicitar-autorizacion`,
      {},
    );
  }

  enviarDirecto(
    comunicadoId: number,
  ): Observable<{ mensaje: string; comunicado: ComunicadoDto }> {
    return this.http.post<{ mensaje: string; comunicado: ComunicadoDto }>(
      `${this.baseUrl}/comunicados/${comunicadoId}/enviar`,
      {},
    );
  }

  aprobar(
    comunicadoId: number,
  ): Observable<{ mensaje: string; comunicado: ComunicadoDto }> {
    return this.http.post<{ mensaje: string; comunicado: ComunicadoDto }>(
      `${this.baseUrl}/comunicados/${comunicadoId}/aprobar`,
      {},
    );
  }

  rechazar(
    comunicadoId: number,
    feedback: string,
  ): Observable<{ mensaje: string; comunicado: ComunicadoDto }> {
    return this.http.post<{ mensaje: string; comunicado: ComunicadoDto }>(
      `${this.baseUrl}/comunicados/${comunicadoId}/rechazar`,
      { feedback },
    );
  }
}
