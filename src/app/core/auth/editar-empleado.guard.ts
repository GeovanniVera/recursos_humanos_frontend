import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Mirrors E-04 including the existing institutional role hierarchy. */
export const puedeEditarEmpleado = (rol: string | null): boolean =>
  rol !== null && ['ADMIN', 'SUPER_ADMIN', 'SISTEMAS'].includes(rol);

export const editarEmpleadoGuard: CanActivateFn = () =>
  puedeEditarEmpleado(inject(AuthService).rol()) ||
  inject(Router).createUrlTree(['/empleados/activos']);
