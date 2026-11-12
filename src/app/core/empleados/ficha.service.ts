import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { FichaEmpleado, FichaEmpleadoResponse } from './ficha.models';

/**
 * Reads the full record of one worker.
 *
 * It holds no state on purpose: the drawer owns `loading`, `error` and the
 * record it received, so closing and reopening the panel always asks again —
 * data can change between two visits.
 *
 * The bearer token is out of scope here — `authInterceptor` attaches it to
 * every outgoing request and clears the session on a `401`.
 */
@Injectable({ providedIn: 'root' })
export class FichaService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = `${environment.apiBaseUrl}/empleados`;

  /**
   * `GET /empleados/{id}` — one worker, addressed by its internal key.
   *
   * The backend wraps the record in `data`, so the envelope is unwrapped here:
   * no screen has to know how Laravel nests a resource.
   */
  consultar(id: number): Observable<FichaEmpleado> {
    return this.http
      .get<FichaEmpleadoResponse>(`${this.baseUrl}/${id}`)
      .pipe(map((response) => response.data));
  }
}
