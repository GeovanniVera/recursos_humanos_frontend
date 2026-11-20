import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  BitacoraDetalleResponse,
  BitacoraListadoResponse,
  BitacoraOrden,
} from './bitacora.models';

const FECHA_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface ConsultaBitacora {
  modulo?: string;
  accion?: string;
  usuarioId?: number;
  buscar?: string;
  fechaDesde?: string; // Y-m-d
  fechaHasta?: string; // Y-m-d
  orden?: BitacoraOrden;
  pagina?: number;
  porPagina?: number;
}

@Injectable({ providedIn: 'root' })
export class BitacoraService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/bitacora`;

  consultar(params: ConsultaBitacora = {}): Observable<BitacoraListadoResponse> {
    let httpParams = new HttpParams();

    const modulo = params.modulo?.trim();
    if (modulo) {
      httpParams = httpParams.set('modulo', modulo);
    }

    const accion = params.accion?.trim();
    if (accion) {
      httpParams = httpParams.set('accion', accion);
    }

    const buscar = params.buscar?.trim();
    if (buscar) {
      httpParams = httpParams.set('buscar', buscar);
    }

    if (typeof params.usuarioId === 'number' && Number.isFinite(params.usuarioId) && params.usuarioId >= 1) {
      httpParams = httpParams.set('usuario_id', params.usuarioId);
    }

    if (params.fechaDesde && FECHA_PATTERN.test(params.fechaDesde)) {
      httpParams = httpParams.set('fecha_desde', params.fechaDesde);
    }

    if (params.fechaHasta && FECHA_PATTERN.test(params.fechaHasta)) {
      httpParams = httpParams.set('fecha_hasta', params.fechaHasta);
    }

    if (params.orden === 'asc' || params.orden === 'desc') {
      // El valor por defecto del backend es desc; se omite para no duplicarlo.
      if (params.orden !== 'desc') {
        httpParams = httpParams.set('orden', params.orden);
      }
    }

    if (typeof params.pagina === 'number' && Number.isFinite(params.pagina) && params.pagina >= 1) {
      httpParams = httpParams.set('pagina', params.pagina);
    }

    if (typeof params.porPagina === 'number' && Number.isFinite(params.porPagina) && params.porPagina >= 1) {
      httpParams = httpParams.set('por_pagina', params.porPagina);
    }

    return this.http.get<BitacoraListadoResponse>(this.baseUrl, { params: httpParams });
  }

  detalle(id: number): Observable<BitacoraDetalleResponse> {
    return this.http.get<BitacoraDetalleResponse>(`${this.baseUrl}/${id}`);
  }
}
