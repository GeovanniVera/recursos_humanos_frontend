import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CrearRolRequest,
  EmpleadoElegibleItem,
  PermisoCatalogoItem,
  PermisoRolPayload,
  RolAdminItem,
  UsuarioAdminItem,
  UsuariosListadoResponse,
} from './usuarios.models';

@Injectable({ providedIn: 'root' })
export class UsuariosAdminService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  listarUsuarios(filtros: {
    buscar?: string;
    rol_id?: number | null;
    activo?: boolean | null;
    page?: number;
  } = {}): Observable<UsuariosListadoResponse> {
    let params = new HttpParams();
    if (filtros.buscar?.trim()) params = params.set('buscar', filtros.buscar.trim());
    if (filtros.rol_id != null) params = params.set('rol_id', String(filtros.rol_id));
    if (filtros.activo != null) params = params.set('activo', filtros.activo ? '1' : '0');
    if (filtros.page != null) params = params.set('page', String(filtros.page));

    return this.http.get<UsuariosListadoResponse>(`${this.baseUrl}/usuarios`, { params });
  }

  buscarEmpleadosElegibles(buscar = ''): Observable<{ datos: EmpleadoElegibleItem[] }> {
    let params = new HttpParams();
    if (buscar.trim()) params = params.set('buscar', buscar.trim());
    return this.http.get<{ datos: EmpleadoElegibleItem[] }>(
      `${this.baseUrl}/usuarios/empleados-elegibles`,
      { params },
    );
  }

  crearUsuario(empleado_id: number, rol_id: number): Observable<{ datos: UsuarioAdminItem }> {
    return this.http.post<{ datos: UsuarioAdminItem }>(`${this.baseUrl}/usuarios`, {
      empleado_id,
      rol_id,
    });
  }

  actualizarRolUsuario(usuarioId: number, rol_id: number): Observable<{ datos: UsuarioAdminItem }> {
    return this.http.patch<{ datos: UsuarioAdminItem }>(`${this.baseUrl}/usuarios/${usuarioId}`, {
      rol_id,
    });
  }

  cambiarEstadoUsuario(usuarioId: number, activo: boolean): Observable<{ datos: UsuarioAdminItem }> {
    return this.http.patch<{ datos: UsuarioAdminItem }>(
      `${this.baseUrl}/usuarios/${usuarioId}/estado`,
      { activo },
    );
  }

  listarRoles(): Observable<{ datos: RolAdminItem[] }> {
    return this.http.get<{ datos: RolAdminItem[] }>(`${this.baseUrl}/roles`);
  }

  listarPermisos(): Observable<{ datos: PermisoCatalogoItem[] }> {
    return this.http.get<{ datos: PermisoCatalogoItem[] }>(`${this.baseUrl}/permisos`);
  }

  crearRol(payload: CrearRolRequest): Observable<{ datos: RolAdminItem }> {
    return this.http.post<{ datos: RolAdminItem }>(`${this.baseUrl}/roles`, payload);
  }

  sincronizarPermisosRol(
    rolId: number,
    permisos: PermisoRolPayload[],
  ): Observable<{ datos: RolAdminItem }> {
    return this.http.put<{ datos: RolAdminItem }>(`${this.baseUrl}/roles/${rolId}/permisos`, {
      permisos,
    });
  }
}
