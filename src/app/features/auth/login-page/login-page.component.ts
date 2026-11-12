import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiErrorResponse } from '../../../core/auth/auth.models';
import { AuthService } from '../../../core/auth/auth.service';
import { AnimatedBackdrop } from '../../../shared/ui/animated-backdrop/animated-backdrop.component';
import { BrandLogos } from '../../../shared/ui/brand-logos/brand-logos.component';
import { OtpInput } from '../otp-input/otp-input.component';

/**
 * Copy invented on the client, and only for failures that carry no message from
 * the backend. Every other message is displayed verbatim.
 */
const MENSAJE_SIN_CONEXION =
  'No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.';

/** Seconds the resend link stays disabled after requesting a code. */
const SEGUNDOS_REENVIO = 30;

/** Digits of the one-time code. */
const LARGO_CODIGO = 6;

/**
 * Passwordless access: institutional email first, then the six digit code.
 *
 * Both steps live in one component because they share the email, the error
 * message and the countdown. `AuthService` owns every HTTP call and persists
 * the token; this page only renders state and routes on success.
 *
 * The page pins itself to the `light` theme through its host attribute. Themes
 * belong to the application, not to the door: the access screen keeps the
 * approved light identity no matter what the user chose inside.
 */
@Component({
  selector: 'app-login-page',
  imports: [FormsModule, RouterLink, AnimatedBackdrop, BrandLogos, OtpInput],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss',
  host: { 'data-theme': 'light' },
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Active step. */
  readonly paso = signal<'correo' | 'codigo'>('correo');

  /** Email as typed, kept so the second step can show it again. */
  readonly correo = signal('');

  /** Code typed by the user. */
  readonly codigo = signal('');

  /** Message to show in the alert, or `null` when there is none. */
  readonly error = signal<string | null>(null);

  /** `true` while a request is in flight. */
  readonly enviando = signal(false);

  /** Seconds left before the code can be requested again. */
  readonly segundos = signal(0);

  private readonly segundosTotales = signal(SEGUNDOS_REENVIO);

  /** Whether the alert is on screen; also drives the error look of the boxes. */
  readonly hayError = computed(() => this.error() !== null);

  /** Submit is armed as soon as there is something that looks like an email. */
  readonly puedeEnviarCorreo = computed(
    () => !this.enviando() && this.segundos() === 0 && this.correo().trim().length > 0,
  );

  /** Verification needs the full code. */
  readonly puedeVerificar = computed(
    () => !this.enviando() && this.codigo().length === LARGO_CODIGO,
  );

  /** Fill of the progress bar, in percent. Drains with the countdown. */
  readonly progreso = computed(() => {
    const total = this.segundosTotales();
    if (total <= 0) {
      return 0;
    }
    return Math.round((this.segundos() / total) * 100);
  });

  /** `mm:ss` label of the resend countdown. */
  readonly etiquetaReenvio = computed(() => {
    const restantes = this.segundos();
    const minutos = Math.floor(restantes / 60)
      .toString()
      .padStart(2, '0');
    const segundos = (restantes % 60).toString().padStart(2, '0');
    return `${minutos}:${segundos}`;
  });

  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.detenerCuenta());
  }

  /** Keeps the email signal in sync with the field. */
  alEscribirCorreo(event: Event): void {
    this.correo.set((event.target as HTMLInputElement).value);
  }

  /** Step 1 — asks the backend for a code. */
  enviarCorreo(): void {
    if (!this.puedeEnviarCorreo()) {
      return;
    }

    const correo = this.correo().trim();
    this.correo.set(correo);
    this.error.set(null);
    this.enviando.set(true);

    this.auth
      .solicitarCodigo(correo)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.enviando.set(false)),
      )
      .subscribe({
        next: () => {
          this.codigo.set('');
          this.paso.set('codigo');
          this.iniciarCuenta(SEGUNDOS_REENVIO);
        },
        error: (error: unknown) => this.manejarError(error),
      });
  }

  /** Step 2 — exchanges the code for a token and enters the app. */
  enviarCodigo(): void {
    if (!this.puedeVerificar()) {
      return;
    }

    this.error.set(null);
    this.enviando.set(true);

    this.auth
      .verificarCodigo(this.correo(), this.codigo())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.enviando.set(false)),
      )
      .subscribe({
        next: () => {
          const destino = this.auth.redirect() ?? '/';
          void this.router.navigateByUrl(destino === '' ? '/' : destino);
        },
        error: (error: unknown) => this.manejarError(error),
      });
  }

  /** Sends a new code without leaving step 2. */
  reenviarCodigo(): void {
    if (this.enviando() || this.segundos() > 0) {
      return;
    }

    this.error.set(null);
    this.enviando.set(true);

    this.auth
      .solicitarCodigo(this.correo())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.enviando.set(false)),
      )
      .subscribe({
        next: () => {
          this.codigo.set('');
          this.iniciarCuenta(SEGUNDOS_REENVIO);
        },
        error: (error: unknown) => this.manejarError(error),
      });
  }

  /** Goes back to step 1. The email survives, the code and the timer do not. */
  cambiarCorreo(): void {
    this.detenerCuenta();
    this.segundos.set(0);
    this.codigo.set('');
    this.error.set(null);
    this.paso.set('correo');
  }

  /** Maps an HTTP failure to the message the user reads. */
  private manejarError(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      const cuerpo = error.error as ApiErrorResponse | null;
      const mensaje = typeof cuerpo?.message === 'string' ? cuerpo.message : null;

      if (error.status === 0) {
        this.error.set(MENSAJE_SIN_CONEXION);
        return;
      }

      if (error.status === 429) {
        // The backend says how long to wait; adopt its number, even above the
        // 30 s the UI starts with.
        this.error.set(mensaje ?? MENSAJE_SIN_CONEXION);
        const espera = cuerpo?.reintentar_en_segundos;
        this.iniciarCuenta(typeof espera === 'number' && espera > 0 ? espera : SEGUNDOS_REENVIO);
        return;
      }

      if (error.status === 422 || error.status === 403) {
        this.error.set(this.conIntentos(mensaje ?? MENSAJE_SIN_CONEXION, cuerpo?.intentos_restantes));
        return;
      }
    }

    this.error.set(MENSAJE_SIN_CONEXION);
  }

  /** Appends the remaining attempts to a backend message, when it sends them. */
  private conIntentos(mensaje: string, intentosRestantes?: number): string {
    if (typeof intentosRestantes !== 'number') {
      return mensaje;
    }
    return `${mensaje} Intentos restantes: ${intentosRestantes}.`;
  }

  /** Starts (or restarts) the resend countdown. */
  private iniciarCuenta(segundos: number): void {
    this.detenerCuenta();
    const total = segundos > 0 ? segundos : SEGUNDOS_REENVIO;
    this.segundosTotales.set(total);
    this.segundos.set(total);

    this.intervalId = setInterval(() => {
      const restantes = this.segundos() - 1;
      if (restantes <= 0) {
        this.segundos.set(0);
        this.detenerCuenta();
        return;
      }
      this.segundos.set(restantes);
    }, 1000);
  }

  private detenerCuenta(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
