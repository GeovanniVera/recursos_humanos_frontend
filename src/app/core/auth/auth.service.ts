import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  SesionResponse,
  SolicitarCodigoRequest,
  SolicitarCodigoResponse,
  VerificarCodigoRequest,
  VerificarCodigoResponse,
} from './auth.models';
import { TokenStorageService } from './token-storage.service';

/**
 * Authentication state and the calls behind the passwordless flow.
 *
 * The signals are the only source of truth for the UI: the token is mirrored
 * into `TokenStorageService` so a reload keeps the session, but templates read
 * `token()`, `sesion()`, `rol()` and `estaAutenticado()`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenStorage = inject(TokenStorageService);

  private readonly baseUrl = `${environment.apiBaseUrl}/auth`;

  private readonly _token = signal<string | null>(this.tokenStorage.read());
  /** Read-only view of the bearer token currently in memory. */
  readonly token = this._token.asReadonly();

  private readonly _sesion = signal<SesionResponse | null>(null);
  /** Read-only view of the last session loaded from the backend. */
  readonly sesion = this._sesion.asReadonly();

  private readonly _redirect = signal<string | null>(null);
  /** Route asked for by the backend after the last successful verification. */
  readonly redirect = this._redirect.asReadonly();

  /** `true` while a token is present, no matter whether it is still valid. */
  readonly estaAutenticado = computed(() => this._token() !== null);

  /** Role of the loaded session, or `null` before it is known. */
  readonly rol = computed(() => this._sesion()?.rol ?? null);

  /** `POST /auth/otp` — asks for the six digit code. */
  solicitarCodigo(correo: string): Observable<SolicitarCodigoResponse> {
    const body: SolicitarCodigoRequest = { correo };
    return this.http.post<SolicitarCodigoResponse>(`${this.baseUrl}/otp`, body);
  }

  /**
   * `POST /auth/otp/verificar` — exchanges the code for a token.
   *
   * On success the token is persisted and the state signals are updated; errors
   * (wrong code, expired code, throttling) are left for the caller to handle.
   */
  verificarCodigo(correo: string, codigo: string): Observable<VerificarCodigoResponse> {
    const body: VerificarCodigoRequest = { correo, codigo };
    return this.http
      .post<VerificarCodigoResponse>(`${this.baseUrl}/otp/verificar`, body)
      .pipe(
        tap((response) => {
          this.tokenStorage.write(response.token);
          this._token.set(response.token);
          this._redirect.set(response.redirect);
        }),
      );
  }

  /** `GET /auth/sesion` — loads the identity behind the current token. */
  cargarSesion(): Observable<SesionResponse> {
    return this.http
      .get<SesionResponse>(`${this.baseUrl}/sesion`)
      .pipe(tap((sesion) => this._sesion.set(sesion)));
  }

  /**
   * `POST /auth/logout` — destroys the token server side.
   *
   * The local state is cleared whether the call succeeds or fails: a revoked
   * user must still be able to throw away the token they are holding.
   */
  cerrarSesion(): Observable<unknown> {
    return this.http
      .post<unknown>(`${this.baseUrl}/logout`, {})
      .pipe(finalize(() => this.limpiarSesionLocal()));
  }

  /** Forgets the token and the session locally, without calling the backend. */
  limpiarSesionLocal(): void {
    this.tokenStorage.clear();
    this._token.set(null);
    this._sesion.set(null);
  }
}
