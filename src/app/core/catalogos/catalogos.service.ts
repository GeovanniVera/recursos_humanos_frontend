import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApiEnvelope,
  AreaCatalogo,
  AsignarAreaRequest,
  AsignarAreaResponse,
  CatalogoDiagnostico,
  CategoriaCatalogo,
  DesasociarAreaResponse,
  EditarPuestoRequest,
  PuestoCatalogo,
  PuestosFiltros,
} from './catalogos.models';

/**
 * Reads the catalogs of the institution and changes the associations of a post.
 *
 * It holds no state on purpose: the screen owns the snapshot, the filters, the
 * pagination and the failures, so what is on screen is always the answer that
 * arrived. The bearer token is out of scope here — `authInterceptor` attaches it
 * to every outgoing request and clears the session on a `401`.
 *
 * The module is association-only: there is no create, rename or deactivate call,
 * because the backend exposes none. What this service offers is the three lists,
 * the diagnostics, the assignment of an area to a set of posts, the removal of
 * one area from one post and the category of a single post.
 *
 * The answer of this API is wrapped in `data`, so the envelope is unwrapped here
 * once instead of in each call site. Two routes are outside the envelope —
 * `puestos/asignar-area` and `diagnostico` — and reading those through it would
 * hand the screen `undefined` exactly where it expects a count. Errors are left
 * untouched: the screen reads `mensaje` / `codigo` / `errors` from them.
 */
@Injectable({ providedIn: 'root' })
export class CatalogosService {
  private readonly http = inject(HttpClient);

  private readonly baseUrl = `${environment.apiBaseUrl}/catalogos`;

  /**
   * `GET /catalogos/puestos` — the complete list, inactive posts included.
   *
   * The three filters travel as query params because the backend is the only
   * side that still knows how many employees hold a post: the row no longer
   * carries that count.
   */
  puestos(filtros: PuestosFiltros = {}): Observable<PuestoCatalogo[]> {
    return this.http
      .get<ApiEnvelope<PuestoCatalogo[]>>(`${this.baseUrl}/puestos`, {
        params: this.paramsDePuestos(filtros),
      })
      .pipe(map((respuesta) => respuesta.data));
  }

  /**
   * `PATCH /catalogos/puestos/{id}` — the category of one post.
   *
   * `categoria_cct_id` is the only accepted field. The backend refuses the
   * change with `409 puesto_con_empleados` while the post holds active
   * employees, so the screen cannot decide it in advance.
   */
  editarPuesto(id: number, dto: EditarPuestoRequest): Observable<PuestoCatalogo> {
    return this.http
      .patch<ApiEnvelope<PuestoCatalogo>>(`${this.baseUrl}/puestos/${id}`, dto)
      .pipe(map((respuesta) => respuesta.data));
  }

  /**
   * `POST /catalogos/puestos/asignar-area` — associates several posts with one
   * area.
   *
   * The answer is **not** wrapped in `data`: it is `{ creados, puestos }` at the
   * root, so it is returned as it arrives. The call is idempotent — re-sending
   * pairs that already exist answers `creados: 0`, never a `409` — and `puestos`
   * carries the rows already updated.
   */
  asignarArea(puestoIds: readonly number[], areaId: number): Observable<AsignarAreaResponse> {
    const cuerpo: AsignarAreaRequest = { puesto_ids: [...puestoIds], area_id: areaId };
    return this.http.post<AsignarAreaResponse>(`${this.baseUrl}/puestos/asignar-area`, cuerpo);
  }

  /**
   * `DELETE /catalogos/puestos/{puesto}/areas/{area}` — removes one association.
   *
   * `desasociado: false` means the pair did not exist. A `409`
   * `puesto_con_empleados` means the post still has active employees in that
   * area, so nothing was removed.
   */
  desasociarArea(puestoId: number, areaId: number): Observable<DesasociarAreaResponse> {
    return this.http.delete<DesasociarAreaResponse>(
      `${this.baseUrl}/puestos/${puestoId}/areas/${areaId}`,
    );
  }

  /** `GET /catalogos/categorias` — every CCT category, inactive ones included. */
  categorias(): Observable<CategoriaCatalogo[]> {
    return this.http
      .get<ApiEnvelope<CategoriaCatalogo[]>>(`${this.baseUrl}/categorias`)
      .pipe(map((respuesta) => respuesta.data));
  }

  /** `GET /catalogos/areas` — the organization chart, flat. */
  areas(): Observable<AreaCatalogo[]> {
    return this.http
      .get<ApiEnvelope<AreaCatalogo[]>>(`${this.baseUrl}/areas`)
      .pipe(map((respuesta) => respuesta.data));
  }

  /**
   * `GET /catalogos/diagnostico` — the findings the banner lists.
   *
   * Flat, without the `data` envelope: the counters sit at the root of the body.
   */
  diagnostico(): Observable<CatalogoDiagnostico> {
    return this.http.get<CatalogoDiagnostico>(`${this.baseUrl}/diagnostico`);
  }

  /**
   * Query string of the post list.
   *
   * Only the three documented params are ever set: `sin_area=1`,
   * `sin_empleados=1` and `activo=1|0`. There is no `area_id` in the contract,
   * so no area is sent; filtering by one area stays on the client.
   */
  private paramsDePuestos(filtros: PuestosFiltros): HttpParams {
    let params = new HttpParams();

    if (filtros.sin_area === true) {
      params = params.set('sin_area', '1');
    }
    if (filtros.sin_empleados === true) {
      params = params.set('sin_empleados', '1');
    }
    if (filtros.activo !== undefined) {
      params = params.set('activo', filtros.activo ? '1' : '0');
    }

    return params;
  }
}
