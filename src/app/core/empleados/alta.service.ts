import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AltaEmpleadoRequest, EmpleadoRegistrado, FormularioCatalogos } from './alta.models';

/**
 * Reads the catalogs of the registration form and creates the employee.
 *
 * It holds no state on purpose: the wizard owns the draft, the step on screen,
 * the loading flag and the failures, so what the user typed is never reset by a
 * request that comes back.
 *
 * Nothing is added to or removed from the body here. `POST /api/empleados`
 * rejects a fixed list of fields as prohibited (`categoria`, `adscripcion`,
 * `puesto`, `email_prefix`, …), so a service that "helpfully" completed the
 * payload would be the one causing the `422`.
 *
 * The bearer token is out of scope here — `authInterceptor` attaches it to
 * every outgoing request and clears the session on a `401`.
 */
@Injectable({ providedIn: 'root' })
export class AltaService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = `${environment.apiBaseUrl}/empleados`;

  /**
   * `GET /empleados/formulario` — every catalog the form needs.
   *
   * The answer is not wrapped in `data`: it arrives at the root of the body.
   */
  cargarCatalogos(): Observable<FormularioCatalogos> {
    return this.http.get<FormularioCatalogos>(`${this.baseUrl}/formulario`);
  }

  /**
   * `POST /empleados` — registers the worker and returns the created record.
   *
   * The body sits at the root of the answer (`201`), not under `data`.
   */
  registrar(datos: AltaEmpleadoRequest): Observable<EmpleadoRegistrado> {
    return this.http.post<EmpleadoRegistrado>(this.baseUrl, datos);
  }
}
