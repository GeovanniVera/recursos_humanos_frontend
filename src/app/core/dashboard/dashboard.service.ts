import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AnaliticaDashboard,
  AnaliticaDashboardResponse,
  ResumenDashboard,
  ResumenDashboardResponse,
} from './dashboard.models';

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

  /** `GET /dashboard/analitica` — tabbed KPIs and aggregated charts. */
  cargarAnalitica(): Observable<AnaliticaDashboard> {
    return this.http
      .get<AnaliticaDashboardResponse>(`${this.baseUrl}/analitica`)
      .pipe(map((response) => response.datos));
  }
}
