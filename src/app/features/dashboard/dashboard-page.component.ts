import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ChartData, ChartOptions } from 'chart.js';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import {
  AnaliticaDashboard,
  ConteoEtiqueta,
  ResumenDashboard,
  ResumenDashboardError,
} from '../../core/dashboard/dashboard.models';
import { DashboardService } from '../../core/dashboard/dashboard.service';
import { AlertBanner } from '../../shared/ui/alert-banner/alert-banner.component';
import { Button } from '../../shared/ui/button/button.component';
import {
  ChartComponent,
  leerTokenColor,
  paletaGrafica,
} from '../../shared/ui/chart/chart.component';

/**
 * Own copy of the screen. Each failure below is a different situation for the
 * user, so each one gets its own sentence and its own action; a single
 * "something went wrong" would throw away that distinction.
 */
const MENSAJE_SESION = 'Tu sesión venció. Vuelve a iniciar sesión.';
const MENSAJE_PERMISO = 'No tienes permisos para ver el panel.';
const MENSAJE_SERVICIO = 'El servicio no está disponible. Reintenta en unos segundos.';
const MENSAJE_CONEXION = 'No pudimos conectar con el servidor. Revisa tu conexión.';

/**
 * What the alert offers the user.
 * - `reintentar`: another request may succeed (server or network).
 * - `iniciar-sesion`: the token is gone, retrying is pointless.
 * - `ninguna`: the answer is final until an administrator grants access.
 */
type DashboardErrorAction = 'reintentar' | 'iniciar-sesion' | 'ninguna';

type DashboardTab = 'plantilla' | 'semaforo' | 'movimientos' | 'comunicacion';

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

/**
 * General panel, reachable at `/`.
 *
 * The screen owns the state of the summary and tabbed analytics — the service
 * holds none — so a reload here never affects another screen.
 */
@Component({
  selector: 'app-dashboard-page',
  imports: [AlertBanner, Button, ChartComponent],
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

  /** Tabbed analytics loaded after the main summary. */
  readonly analitica = signal<AnaliticaDashboard | null>(null);
  readonly tabActiva = signal<DashboardTab>('plantilla');

  /** One formatter for every count, so counters group digits alike. */
  private readonly formato = new Intl.NumberFormat('es-MX');

  readonly valorActivos = computed(() => this.formatear(this.resumen()?.empleados_activos));

  readonly valorBaja = computed(() => this.formatear(this.resumen()?.empleados_baja));

  readonly horizontalBarOptions: ChartOptions<'bar'> = {
    indexAxis: 'y',
  };

  readonly groupedBarOptions: ChartOptions<'bar'> = {
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
      },
    },
  };

  readonly areasChartData = computed(() =>
    this.toBarData(this.analitica()?.plantilla.top_areas ?? [], 'Personal activo'),
  );

  readonly categoriaChartData = computed(() =>
    this.toBarData(
      this.analitica()?.plantilla.por_categoria_cct ?? [],
      'Personal activo',
      leerTokenColor('--color-state-success', '#2f6f4e'),
    ),
  );

  readonly tipoPersonalChartData = computed(() =>
    this.toPieData(this.analitica()?.plantilla.por_tipo_personal ?? []),
  );

  readonly jornadaChartData = computed(() =>
    this.toPieData(this.analitica()?.plantilla.por_jornada ?? []),
  );

  readonly sexoChartData = computed(() =>
    this.toPieData(this.analitica()?.plantilla.por_sexo ?? []),
  );

  readonly semaforoChartData = computed<ChartData<'doughnut'> | null>(() => {
    const s = this.analitica()?.semaforo;
    if (!s) return null;
    return {
      labels: ['Completos', 'Casi completos', 'Incompletos'],
      datasets: [
        {
          data: [s.completos, s.casi_completos, s.incompletos],
          backgroundColor: [
            leerTokenColor('--color-state-success', '#2f6f4e'),
            leerTokenColor('--color-state-warning', '#b26b1b'),
            leerTokenColor('--color-state-error', '#a63a3a'),
          ],
          borderWidth: 0,
        },
      ],
    };
  });

  readonly estudiosChartData = computed(() =>
    this.toBarData(this.analitica()?.semaforo.por_nivel_estudios ?? [], 'Empleados'),
  );

  readonly movimientosSerieData = computed<ChartData<'bar'> | null>(() => {
    const serie = this.analitica()?.movimientos.serie_mensual;
    if (!serie || serie.length === 0) return null;
    return {
      labels: serie.map((m) => m.mes),
      datasets: [
        {
          label: 'Altas',
          data: serie.map((m) => m.altas),
          backgroundColor: leerTokenColor('--color-state-success', '#2f6f4e'),
          borderRadius: 4,
        },
        {
          label: 'Bajas',
          data: serie.map((m) => m.bajas),
          backgroundColor: leerTokenColor('--color-state-error', '#a63a3a'),
          borderRadius: 4,
        },
      ],
    };
  });

  readonly motivosBajaChartData = computed(() =>
    this.toBarData(
      this.analitica()?.movimientos.motivos_baja ?? [],
      'Registros',
      leerTokenColor('--color-state-error', '#a63a3a'),
    ),
  );

  readonly comunicacionChartData = computed(() =>
    this.toPieData(this.analitica()?.comunicacion.por_estatus ?? []),
  );

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
        next: (resumen) => {
          this.resumen.set(resumen);
          this.cargarAnalitica();
        },
        error: (error: unknown) => this.manejarError(error),
      });
  }

  private cargarAnalitica(): void {
    this.dashboard
      .cargarAnalitica()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (datos) => {
          this.analitica.set(datos);
        },
        error: () => {
          this.analitica.set(null);
        },
      });
  }

  private toBarData(
    lista: readonly ConteoEtiqueta[],
    etiqueta: string,
    color?: string,
  ): ChartData<'bar'> {
    const fill = color ?? leerTokenColor('--color-accent', '#1b4d89');
    return {
      labels: lista.map((i) => i.etiqueta),
      datasets: [
        {
          label: etiqueta,
          data: lista.map((i) => i.total),
          backgroundColor: fill,
          borderRadius: 4,
        },
      ],
    };
  }

  private toPieData(lista: readonly ConteoEtiqueta[]): ChartData<'doughnut'> {
    const paleta = paletaGrafica();
    return {
      labels: lista.map((i) => i.etiqueta),
      datasets: [
        {
          data: lista.map((i) => i.total),
          backgroundColor: lista.map((_, idx) => paleta[idx % paleta.length]),
          borderWidth: 0,
        },
      ],
    };
  }

  /** Drops the local session and returns to the door. */
  iniciarSesion(): void {
    this.auth.limpiarSesionLocal();
    void this.router.navigate(['/login']);
  }

  alNavegarTabs(event: KeyboardEvent): void {
    const tabs: readonly DashboardTab[] = ['plantilla', 'semaforo', 'movimientos', 'comunicacion'];
    const current = tabs.indexOf(this.tabActiva());
    let next = current;

    switch (event.key) {
      case 'ArrowRight':
        next = (current + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        next = (current - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    this.tabActiva.set(tabs[next]);
    const list = event.currentTarget as HTMLElement | null;
    const buttons = list?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[next]?.focus();
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
