import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ConsultaSemaforo, FaltantesResponse, SemaforoResponse } from './semaforo.models';

/** Only the wire contract. Authentication belongs to the existing interceptor. */
@Injectable({ providedIn: 'root' })
export class SemaforoService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/semaforo`;

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

  faltantes(id: number): Observable<FaltantesResponse> {
    return this.http.get<FaltantesResponse>(`${this.url}/${id}/faltantes`);
  }
}
