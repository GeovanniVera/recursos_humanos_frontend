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
 * invalidates the session and opens the shared notification. Its close action
 * owns navigation; concurrent rejections of the old token are ignored.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenStorage = inject(TokenStorageService);
  const auth = inject(AuthService);

  const token = tokenStorage.read();
  if (auth.expiracionPendiente() && !/\/auth\/otp(?:\/verificar)?$/.test(req.url)) {
    return throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Sesión expirada' }));
  }
  const request = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        if (token !== null && auth.token() === token) auth.notificarSesionExpirada();
      }
      return throwError(() => error);
    }),
  );
};
