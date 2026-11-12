import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ResumenDashboard, ResumenDashboardError } from '../../core/dashboard/dashboard.models';
import { DashboardService } from '../../core/dashboard/dashboard.service';
import { Button } from '../../shared/ui/button/button.component';
import { KpiCard } from '../../shared/ui/kpi-card/kpi-card.component';
import { Modal } from '../../shared/ui/modal/modal.component';

/**
 * Own copy of the screen. Each failure below is a different situation for the
 * user, so each one gets its own sentence and its own action; a single
 * "something went wrong" would throw away that distinction.
 */
const MENSAJE_SESION = 'Tu sesión venció. Volvé a iniciar sesión.';
const MENSAJE_PERMISO = 'No tenés permisos para ver el panel.';
const MENSAJE_SERVICIO = 'El servicio no está disponible. Reintentá en unos segundos.';
const MENSAJE_CONEXION = 'No pudimos conectar con el servidor. Revisá tu conexión.';

/**
 * What the alert offers the user.
 * - `reintentar`: another request may succeed (server or network).
 * - `iniciar-sesion`: the token is gone, retrying is pointless.
 * - `ninguna`: the answer is final until an administrator grants access.
 */
type DashboardErrorAction = 'reintentar' | 'iniciar-sesion' | 'ninguna';

/** Failure of the panel, already translated into copy and into an action. */
interface DashboardError {
  /** HTTP status, or `0` when the request never reached the server. */
  status: number;
  /** Sentence the user reads. */
  mensaje: string;
  /** Contract code from the body (`permiso_denegado`, …), when there is one. */
  codigo: string | null;
  accion: DashboardErrorAction;
}

/**
 * Placeholder for a figure that is not known: loading, or a failed request.
 * Never `0`, because zero is a real answer of this API.
 */
const SIN_DATO = '—';

/** Sentence shown when the total of active employees cannot produce a ratio. */
const SIN_PORCENTAJE = 'Sin porcentaje';

/**
 * General panel, reachable at `/`.
 *
 * The screen owns the state of the three counters — the service holds none —
 * so a reload here never affects another screen. The percentage is computed
 * here as well: the contract sends counts only, and the ratio is ours.
 *
 * All three cards are buttons: each opens a layer with the metric explained and
 * a shortcut to the screen that lists it. `Expedientes completos` is the one
 * whose meaning is not obvious from its label, so its layer carries the extra
 * explanation of what the metric counts.
 */
@Component({
  selector: 'app-dashboard-page',
  imports: [Button, KpiCard, Modal],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
})
export class DashboardPage {
  private readonly dashboard = inject(DashboardService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** `true` while a summary is in flight. */
  readonly loading = signal(false);

  /** Last failure, or `null`. */
  readonly error = signal<DashboardError | null>(null);

  /** Counters of the last successful request. Cleared when a request fails. */
  readonly resumen = signal<ResumenDashboard | null>(null);

  /** Layer of the `Expedientes completos` metric. */
  readonly detalleAbierto = signal(false);

  /** Quick-access layers of the other two counters. */
  readonly accesoActivos = signal(false);
  readonly accesoBaja = signal(false);

  /** One formatter for every count, so the three cards group digits alike. */
  private readonly formato = new Intl.NumberFormat('es-MX');

  /**
   * Share of complete files over the active employees, rounded to a whole
   * percent. `null` when there is nothing to divide: with no active employees
   * a ratio would be a division by zero, not a `0 %`.
   */
  readonly porcentaje = computed(() => {
    const resumen = this.resumen();
    if (resumen === null || resumen.empleados_activos <= 0) {
      return null;
    }
    return Math.round((resumen.expedientes_completos / resumen.empleados_activos) * 100);
  });

  readonly valorActivos = computed(() => this.formatear(this.resumen()?.empleados_activos));

  readonly valorBaja = computed(() => this.formatear(this.resumen()?.empleados_baja));

  readonly valorExpedientes = computed(() =>
    this.formatear(this.resumen()?.expedientes_completos),
  );

  /**
   * Line under the third figure. It is the only hint that carries data, so it
   * disappears while the data is unknown instead of guessing a value.
   */
  readonly pistaExpedientes = computed(() => {
    if (this.resumen() === null) {
      return undefined;
    }
    const porcentaje = this.porcentaje();
    return porcentaje === null ? SIN_PORCENTAJE : `${porcentaje} % de los activos`;
  });

  /** Same ratio as the hint, for the layer. */
  readonly porcentajeTexto = computed(() => {
    const porcentaje = this.porcentaje();
    return porcentaje === null ? SIN_DATO : `${porcentaje} %`;
  });

  constructor() {
    this.cargar();
  }

  /** Loads (or reloads) the three counters. Also the retry of the alert. */
  cargar(): void {
    if (this.loading()) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.dashboard
      .cargarResumen()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (resumen) => this.resumen.set(resumen),
        error: (error: unknown) => this.manejarError(error),
      });
  }

  /** Drops the local session and returns to the door. */
  iniciarSesion(): void {
    this.auth.limpiarSesionLocal();
    void this.router.navigate(['/login']);
  }

  /**
   * Shortcut of a card: closes whichever layer is open and goes to the screen
   * that lists the metric. The layers close first so a blocked navigation never
   * leaves a modal floating over the panel.
   */
  ir(ruta: string): void {
    this.accesoActivos.set(false);
    this.accesoBaja.set(false);
    this.detalleAbierto.set(false);
    void this.router.navigate([ruta]);
  }

  /** Maps an HTTP failure to the sentence and the action the user gets. */
  private manejarError(error: unknown): void {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const codigo = this.codigoDe(error);

    // Numbers from a previous request would read as current: drop them.
    this.resumen.set(null);

    switch (status) {
      case 401:
        this.error.set({ status, mensaje: MENSAJE_SESION, codigo, accion: 'iniciar-sesion' });
        return;
      case 403:
        this.error.set({ status, mensaje: MENSAJE_PERMISO, codigo, accion: 'ninguna' });
        return;
      case 503:
        this.error.set({ status, mensaje: MENSAJE_SERVICIO, codigo, accion: 'reintentar' });
        return;
      default:
        this.error.set({ status, mensaje: MENSAJE_CONEXION, codigo, accion: 'reintentar' });
    }
  }

  /** Reads `codigo` out of the error body without trusting its shape. */
  private codigoDe(error: unknown): string | null {
    if (!(error instanceof HttpErrorResponse)) {
      return null;
    }
    const cuerpo = error.error as ResumenDashboardError | null;
    return typeof cuerpo?.codigo === 'string' ? cuerpo.codigo : null;
  }

  /** Formats a count, or the unknown placeholder when there is no count. */
  private formatear(valor: number | undefined): string {
    return typeof valor === 'number' ? this.formato.format(valor) : SIN_DATO;
  }
}
