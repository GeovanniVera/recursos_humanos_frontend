import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PadronResponse } from './padron.models';

/** Options of a roster query. Every field is optional on the wire. */
export interface ConsultaPadron {
  /** Free text search. Needs the `E-12` capability; without it the API answers `403`. */
  buscar?: string;
  /** 1-based page. The backend starts at 1 when it is absent. */
  pagina?: number;
  /** Page size. Defaults to 20 on the backend, never above 100. */
  porPagina?: number;
}

/**
 * Reads the roster.
 *
 * It holds no state on purpose: the screen owns `buscar`, `pagina`, `loading`,
 * `error` and the last page it received, so the request that goes out is always
 * the one the user is looking at. The bearer token is out of scope here —
 * `authInterceptor` attaches it to every outgoing request and clears the
 * session on a `401`.
 */
@Injectable({ providedIn: 'root' })
export class PadronService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = `${environment.apiBaseUrl}/padron`;

  /**
   * `GET /api/padron` — one page of the roster.
   *
   * Only the options the caller set travel as query params: an absent term must
   * not become `buscar=`, because the backend would read it as a search for the
   * empty string instead of "no search".
   */
  consultar(params: ConsultaPadron = {}): Observable<PadronResponse> {
    let httpParams = new HttpParams();

    // An empty or blank term is no term at all: the search needs the `E-12`
    // capability, so sending `buscar=` would trade a listed roster for a `403`.
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

    return this.http.get<PadronResponse>(this.baseUrl, { params: httpParams });
  }
}
