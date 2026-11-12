import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { TokenStorageService } from '../auth/token-storage.service';

/**
 * Attaches the bearer token to every outgoing request and drops the local
 * session when the backend answers `401`.
 *
 * Expired or revoked tokens are detected here, not in each feature: a `401`
 * clears the token so the next guarded navigation sends the user to login.
 * Navigation is intentionally out of scope — the app shell owns routing.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenStorage = inject(TokenStorageService);
  const auth = inject(AuthService);

  const token = tokenStorage.read();
  const request = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        auth.limpiarSesionLocal();
      }
      return throwError(() => error);
    }),
  );
};
