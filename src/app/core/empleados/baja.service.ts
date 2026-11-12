import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  BajaEmpleadoRequest,
  BajaEmpleadoResponse,
  MotivoBaja,
  MotivosBajaResponse,
} from './baja.models';

/**
 * Reads the motive catalog and registers the termination of a worker.
 *
 * It holds no state on purpose: the modal owns the chosen motive, the note, the
 * loading flag and the failures, so a request that comes back never wipes what
 * the user typed.
 *
 * Nothing is added to the body here either: the endpoint answers `422` for the
 * fields it prohibits (`fecha_baja`, `baja_por`, `motivo`, `motivo_baja`,
 * `nota_baja`), so a service that "helpfully" completed the payload would be the
 * one causing the failure. The date and the actor belong to the server.
 *
 * The bearer token is out of scope here — `authInterceptor` attaches it to
 * every outgoing request and clears the session on a `401`.
 */
@Injectable({ providedIn: 'root' })
export class BajaService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = environment.apiBaseUrl;

  /**
   * `GET /catalogos/motivos-baja` — the active motives the role may use.
   *
   * The backend wraps the list in `data`, so the envelope is unwrapped here: no
   * screen has to know how Laravel nests a resource.
   */
  cargarMotivos(): Observable<readonly MotivoBaja[]> {
    return this.http
      .get<MotivosBajaResponse>(`${this.baseUrl}/catalogos/motivos-baja`)
      .pipe(map((response) => response.data));
  }

  /**
   * `POST /empleados/{id}/baja` — gives the worker a termination date.
   *
   * The body sits at the root of the answer, not under `data`.
   */
  darDeBaja(
    empleadoId: number,
    datos: BajaEmpleadoRequest,
  ): Observable<BajaEmpleadoResponse> {
    return this.http.post<BajaEmpleadoResponse>(
      `${this.baseUrl}/empleados/${empleadoId}/baja`,
      datos,
    );
  }
}
