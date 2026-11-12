import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiErrorResponse } from '../../../core/auth/auth.models';
import { AuthService } from '../../../core/auth/auth.service';
import { AnimatedBackdrop } from '../../../shared/ui/animated-backdrop/animated-backdrop.component';
import { OtpInput } from '../otp-input/otp-input.component';

/**
 * Mensaje por defecto cuando no hay respuesta o falla la conexión con el servidor.
 */
const MENSAJE_SIN_CONEXION =
  'No pudimos conectar con el servidor. Revisá tu conexión e intentá de nuevo.';

/** Segundos que el enlace de reenvío permanece deshabilitado tras solicitar código. */
const SEGUNDOS_REENVIO = 30;

/** Longitud del código numérico de verificación. */
const LARGO_CODIGO = 6;

/**
 * Pantalla de inicio de sesión institucional con autenticación sin contraseña (OTP).
 * Paso 1: Correo institucional.
 * Paso 2: Código de verificación de 6 dígitos.
 */
@Component({
  selector: 'app-login-page',
  imports: [FormsModule, AnimatedBackdrop, OtpInput],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss',
  host: { 'data-theme': 'light' },
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Paso activo del flujo: correo o código OTP */
  readonly paso = signal<'correo' | 'codigo'>('correo');

  /** Correo tal como fue escrito por el usuario */
  readonly correo = signal('');

  /** Código numérico escrito por el usuario */
  readonly codigo = signal('');

  /** Mensaje de error, o null cuando no hay ninguno */
  readonly error = signal<string | null>(null);

  /** true mientras hay una petición en curso */
  readonly enviando = signal(false);

  /** true al verificar con éxito para desplegar la animación de checkmark previa a navegación */
  readonly verificado = signal(false);

  /** Segundos restantes para reenviar código */
  readonly segundos = signal(0);

  private readonly segundosTotales = signal(SEGUNDOS_REENVIO);

  /** Indica si hay un error activo en pantalla */
  readonly hayError = computed(() => this.error() !== null);

  /** Habilitado en cuanto se ingresa texto en el correo */
  readonly puedeEnviarCorreo = computed(
    () => !this.enviando() && this.segundos() === 0 && this.correo().trim().length > 0,
  );

  /** Habilitado cuando se han completado los 6 dígitos */
  readonly puedeVerificar = computed(
    () => !this.enviando() && this.codigo().length === LARGO_CODIGO,
  );

  /** Progreso de la barra de temporizador de reenvío (0 a 100%) */
  readonly progreso = computed(() => {
    const total = this.segundosTotales();
    if (total <= 0) {
      return 0;
    }
    return Math.round((this.segundos() / total) * 100);
  });

  /** Etiqueta formateada mm:ss para el reenvío */
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

  alEscribirCorreo(event: Event): void {
    this.correo.set((event.target as HTMLInputElement).value);
  }

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
          this.verificado.set(true);
          setTimeout(() => {
            const destino = this.auth.redirect() ?? '/';
            void this.router.navigateByUrl(destino === '' ? '/' : destino);
          }, 700);
        },
        error: (error: unknown) => this.manejarError(error),
      });
  }

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

  cambiarCorreo(): void {
    this.detenerCuenta();
    this.segundos.set(0);
    this.codigo.set('');
    this.error.set(null);
    this.verificado.set(false);
    this.paso.set('correo');
  }

  private manejarError(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      const cuerpo = error.error as ApiErrorResponse | null;
      const mensaje = typeof cuerpo?.message === 'string' ? cuerpo.message : null;

      if (error.status === 0) {
        this.error.set(MENSAJE_SIN_CONEXION);
        return;
      }

      if (error.status === 429) {
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

  private conIntentos(mensaje: string, intentosRestantes?: number): string {
    if (typeof intentosRestantes !== 'number') {
      return mensaje;
    }
    return `${mensaje} Intentos restantes: ${intentosRestantes}.`;
  }

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
