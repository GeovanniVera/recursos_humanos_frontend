import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { EmpleadoListadoResponse, FiltroEstatus } from './listado.models';

/** Options of a listing query. Every field is optional on the wire. */
export interface ConsultaEmpleados {
  /** `todos` is the wildcard of the contract, not a fourth state. */
  estatus?: FiltroEstatus;
  /** Free text search. Needs the `E-12` capability; without it the API answers `403`. */
  buscar?: string;
  /** 1-based page. The backend starts at 1 when it is absent. */
  pagina?: number;
  /** Page size. Defaults to 20 on the backend, never above 100. */
  porPagina?: number;
}

/**
 * Reads the listing that knows the three employment states.
 *
 * It is not the roster (`/api/padron`): that endpoint answers with active
 * workers alone under a two-value `estado`. This one filters on `estatus` and
 * returns `datos`, `meta` and `enlaces` at the root of the body.
 *
 * It holds no state on purpose: the screen owns the filter, the page and the
 * failures, so the request that goes out is always the one the user is looking
 * at. The bearer token is out of scope here — `authInterceptor` attaches it to
 * every outgoing request and clears the session on a `401`.
 */
@Injectable({ providedIn: 'root' })
export class EmpleadosListadoService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = `${environment.apiBaseUrl}/empleados`;

  /**
   * `GET /api/empleados` — one page of the listing.
   *
   * Only the options the caller set travel as query params: an absent term must
   * not become `buscar=`, because the backend would read it as a search for the
   * empty string instead of "no search".
   */
  consultar(params: ConsultaEmpleados = {}): Observable<EmpleadoListadoResponse> {
    let httpParams = new HttpParams();

    if (params.estatus !== undefined) {
      httpParams = httpParams.set('estatus', params.estatus);
    }

    const buscar = params.buscar?.trim();
    if (buscar) {
      httpParams = httpParams.set('buscar', buscar);
    }
    if (params.pagina !== undefined) {
      httpParams = httpParams.set('pagina', params.pagina);
    }
    if (params.porPagina !== undefined) {
      httpParams = httpParams.set('por_pagina', params.porPagina);
    }

    return this.http.get<EmpleadoListadoResponse>(this.baseUrl, { params: httpParams });
  }
}
