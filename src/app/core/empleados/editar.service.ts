import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ActualizarEmpleoExternoRequest,
  ActualizarGradoAcademicoRequest,
  AdscripcionHistorialResponse,
  CambiarAdscripcionRequest,
  CorregirNumEmpleadoRequest,
  EdicionEmpleadoRequest,
  EmpleoExternoRequest,
  GradoAcademicoRequest,
  RectificarIdentidadRequest,
} from './editar.models';
import { FichaEmpleadoResponse } from './ficha.models';

/**
 * HTTP surface of the record's edit flows.
 *
 * One service for the scalar edition (E-04), the two 1:N folders (E-14), the
 * assignment change, the identity rectification (E-10) and the employee-number
 * correction (E-11): they all answer with the whole record, so the drawer never
 * has to merge a partial response into what it already holds.
 *
 * It holds no state on purpose: the folder owns the draft and the failures, so
 * a request that comes back never wipes what the user typed. The bearer token
 * is out of scope — `authInterceptor` attaches it and clears the session on a
 * `401`.
 *
 * Errors are left untouched: the caller reads `mensaje`, `codigo` and `errors`
 * from `EdicionError`, because a `409 conflicto_concurrencia` needs a different
 * sentence than a `422` of one field.
 */
@Injectable({ providedIn: 'root' })
export class EditarEmpleadoService {
  private readonly http = inject(HttpClient);

  private readonly url = `${environment.apiBaseUrl}/empleados`;

  /** `GET /empleados/{id}` — the record the folder starts from. */
  consultar(id: number): Observable<FichaEmpleadoResponse> {
    return this.http.get<FichaEmpleadoResponse>(`${this.url}/${id}`);
  }

  /** `PATCH /empleados/{id}` — the four scalars, only what changed. */
  actualizar(id: number, datos: EdicionEmpleadoRequest): Observable<FichaEmpleadoResponse> {
    return this.http.patch<FichaEmpleadoResponse>(`${this.url}/${id}`, datos);
  }

  // ---------------------------------------------------------------------------
  // Carpeta de grados académicos
  // ---------------------------------------------------------------------------

  agregarGrado(id: number, datos: GradoAcademicoRequest): Observable<FichaEmpleadoResponse> {
    return this.http.post<FichaEmpleadoResponse>(`${this.url}/${id}/grados`, datos);
  }

  actualizarGrado(
    id: number,
    gradoId: number,
    datos: ActualizarGradoAcademicoRequest,
  ): Observable<FichaEmpleadoResponse> {
    return this.http.patch<FichaEmpleadoResponse>(`${this.url}/${id}/grados/${gradoId}`, datos);
  }

  eliminarGrado(id: number, gradoId: number): Observable<FichaEmpleadoResponse> {
    return this.http.delete<FichaEmpleadoResponse>(`${this.url}/${id}/grados/${gradoId}`);
  }

  // ---------------------------------------------------------------------------
  // Carpeta de empleos externos
  // ---------------------------------------------------------------------------

  agregarEmpleoExterno(id: number, datos: EmpleoExternoRequest): Observable<FichaEmpleadoResponse> {
    return this.http.post<FichaEmpleadoResponse>(`${this.url}/${id}/empleos-externos`, datos);
  }

  actualizarEmpleoExterno(
    id: number,
    empleoId: number,
    datos: ActualizarEmpleoExternoRequest,
  ): Observable<FichaEmpleadoResponse> {
    return this.http.patch<FichaEmpleadoResponse>(`${this.url}/${id}/empleos-externos/${empleoId}`, datos);
  }

  eliminarEmpleoExterno(id: number, empleoId: number): Observable<FichaEmpleadoResponse> {
    return this.http.delete<FichaEmpleadoResponse>(`${this.url}/${id}/empleos-externos/${empleoId}`);
  }

  // ---------------------------------------------------------------------------
  // Adscripción
  // ---------------------------------------------------------------------------

  /** `POST /empleados/{id}/adscripcion` — closes the current period and opens one. */
  cambiarAdscripcion(
    id: number,
    datos: CambiarAdscripcionRequest,
  ): Observable<FichaEmpleadoResponse> {
    return this.http.post<FichaEmpleadoResponse>(`${this.url}/${id}/adscripcion`, datos);
  }

  /** `GET /empleados/{id}/historial` — every appointment period, newest first. */
  historialAdscripciones(id: number): Observable<AdscripcionHistorialResponse> {
    return this.http.get<AdscripcionHistorialResponse>(`${this.url}/${id}/historial`);
  }

  // ---------------------------------------------------------------------------
  // Actos auditados
  // ---------------------------------------------------------------------------

  /** `PATCH /empleados/{id}/identidad` (E-10). */
  rectificarIdentidad(
    id: number,
    datos: RectificarIdentidadRequest,
  ): Observable<FichaEmpleadoResponse> {
    return this.http.patch<FichaEmpleadoResponse>(`${this.url}/${id}/identidad`, datos);
  }

  /** `PATCH /empleados/{id}/num-empleado` (E-11). */
  corregirNumEmpleado(
    id: number,
    datos: CorregirNumEmpleadoRequest,
  ): Observable<FichaEmpleadoResponse> {
    return this.http.patch<FichaEmpleadoResponse>(`${this.url}/${id}/num-empleado`, datos);
  }
}
