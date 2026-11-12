import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ResumenDashboard, ResumenDashboardResponse } from './dashboard.models';

/**
 * Reads the counters of the general panel.
 *
 * It holds no state on purpose: the screen owns `loading`, `error` and the
 * data, so two screens that ask for the summary load independently and a
 * failed request in one of them cannot blank the other.
 *
 * The bearer token is out of scope here — `authInterceptor` attaches it to
 * every outgoing request and clears the session on a `401`.
 */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = `${environment.apiBaseUrl}/dashboard`;

  /** `GET /dashboard/resumen` — the three counters of the panel. */
  cargarResumen(): Observable<ResumenDashboard> {
    return this.http
      .get<ResumenDashboardResponse>(`${this.baseUrl}/resumen`)
      .pipe(map((response) => response.datos));
  }
}
