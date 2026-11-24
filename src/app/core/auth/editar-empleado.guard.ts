import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Checks `empleados.editar` from session permissions, with role fallback for legacy mocks. */
export const puedeEditarEmpleado = (rol: string | null): boolean =>
  rol !== null && ['ADMIN', 'SUPER_ADMIN', 'SISTEMAS'].includes(rol);

export const editarEmpleadoGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const tienePermisos = (auth.permisos?.().size ?? 0) > 0;
  const permitido = tienePermisos
    ? auth.tienePermiso('empleados.editar')
    : puedeEditarEmpleado(auth.rol());

  return permitido || inject(Router).createUrlTree(['/empleados']);
};
