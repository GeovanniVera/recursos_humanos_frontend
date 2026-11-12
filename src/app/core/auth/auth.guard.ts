import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Protects every screen behind the session.
 *
 * A token alone is not enough: the identity behind it has to be loaded before
 * the shell renders, because the sidebar and the top bar read the role. When the
 * token is rejected the local session is dropped and the user goes to `/login`.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.token() === null) {
    void router.navigate(['/login']);
    return false;
  }

  if (auth.sesion() !== null) {
    return true;
  }

  return auth.cargarSesion().pipe(
    map(() => true),
    catchError(() => {
      auth.limpiarSesionLocal();
      void router.navigate(['/login']);
      return of(false);
    }),
  );
};

/**
 * Keeps an authenticated user out of the login screen. The landing page is `/`
 * because the backend redirect is only known right after a verification.
 */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.token() === null) {
    return true;
  }

  void router.navigate(['/']);
  return false;
};
