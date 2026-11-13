import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, Subject, catchError, finalize, switchMap } from 'rxjs';
import { etiquetaCampoExpediente } from '../../../core/empleados/expediente-campos';
import {
  EstadoExpediente,
  FichaEmpleado,
  FichaError,
  FichaEstadoExpediente,
  HistorialBaja,
  TipoBajaHistorial,
} from '../../../core/empleados/ficha.models';
import { FichaService } from '../../../core/empleados/ficha.service';
import { AlertBanner } from '../../../shared/ui/alert-banner/alert-banner.component';
import { Button } from '../../../shared/ui/button/button.component';
import { Drawer } from '../../../shared/ui/drawer/drawer.component';
import { StatusPill, StatusPillTone } from '../../../shared/ui/status-pill/status-pill.component';
import { BajaModal } from '../baja/baja-modal.component';

/**
 * Own copy of the panel. Every failure is a different situation for the user,
 * so each one gets its own sentence; a single "something went wrong" would
 * throw that distinction away. The `404` sentence is ours and not the body's:
 * the same status also comes from the route itself (a non-numeric id never
 * reaches the API) and Laravel answers a different body there, so trusting the
 * body would print two sentences for one situation. The body's own sentence is
 * still shown verbatim under it, for support.
 */
const MESSAGE_SESSION = 'Tu sesión venció. Vuelve a iniciar sesión.';
const MESSAGE_PERMISSION = 'No tienes permisos para ver esta ficha.';
const MESSAGE_BAJAS_PERMISSION = 'No tienes permisos para ver el historial de bajas.';
const MESSAGE_NOT_FOUND = 'No encontramos ese trabajador.';
const MESSAGE_CONNECTION = 'No pudimos conectar con el servidor. Revisa tu conexión.';

/**
 * Placeholder for a value the record does not carry. Never an empty cell and
 * never the string `null`: a missing CURP has to read as "not registered".
 */
const NO_VALUE = '—';

/** What the alert offers the user: another try, or nothing at all. */
type FichaErrorAction = 'reintentar' | 'ninguna';

/** Failure of the record, already translated into copy and into an action. */
interface FichaFailure {
  /** HTTP status, or `0` when the request never reached the server. */
  status: number;
  /** Sentence the user reads. */
  mensaje: string;
  /** Contract value from the body (`permiso_denegado`), shown muted. */
  detalle: string | null;
  accion: FichaErrorAction;
}

/**
 * Date formatter of the record.
 *
 * `timeZone: 'UTC'` is not decoration: the API sends a calendar day
 * (`YYYY-MM-DD`), which is parsed as UTC midnight, and formatting it in a local
 * zone west of UTC would print the previous day. Parsing and formatting in UTC
 * keeps the day the backend wrote, for every user of every timezone.
 */
const DATE_FORMAT = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Skeleton lines standing in for the record while it loads. */
const SKELETON_LINES = 9;

/** Skeleton lines for the auto-loaded termination history section. */
const BAJAS_SKELETON_LINES = 3;

/**
 * The full record of one worker, in a side panel.
 *
 * It is a view and nothing else: it owns the request, its loading state and its
 * failure, and the roster only tells it which id to open. Closing clears the
 * record on purpose — reopening asks again, because a plaza or a file state can
 * change between two visits and a cached panel would state yesterday's truth.
 *
 * The termination layer lives outside this panel, next to it and not inside it:
 * a `<dialog>` nested in another one fights for the top layer and for the focus
 * trap, so the second one wins only by accident.
 */
@Component({
  selector: 'app-ficha-drawer',
  imports: [AlertBanner, BajaModal, Button, Drawer, StatusPill],
  templateUrl: './ficha-drawer.component.html',
  styleUrl: './ficha-drawer.component.scss',
})
export class FichaDrawer {
  private readonly fichaService = inject(FichaService);
  private readonly destroyRef = inject(DestroyRef);

  /** Internal key of the worker to show. `null` means "nothing selected yet". */
  readonly empleadoId = input<number | null>(null);

  /** Whether the panel is open. Two-way bound to the page that hosts it. */
  readonly open = model(false);

  /** Whether inline editing is enabled by a backing contract/workflow. */
  readonly puedeEditar = input(false);

  /** Emits the loaded worker id when edition is triggered and available. */
  readonly editarSolicitado = output<number>();

  /**
   * Fired when the termination layer reports a `200`.
   *
   * The panel does not know how to refresh a roster: it only says that the act
   * happened, and the page that owns the list decides what to ask again.
   */
  readonly bajaRegistrada = output<void>();

  /** Whether the termination layer is open. */
  readonly bajaAbierta = signal(false);

  /** Record of the last successful request, or `null`. */
  readonly ficha = signal<FichaEmpleado | null>(null);

  /** `true` while a record is in flight. */
  readonly loading = signal(false);

  /** Last failure, or `null`. */
  readonly error = signal<FichaFailure | null>(null);

  /** Chronological absence/termination history of the loaded worker. */
  readonly bajas = signal<HistorialBaja[]>([]);

  /** `true` while the absence history request is in flight. */
  readonly loadingBajas = signal(false);

  /** Last failure of the absence history request, or `null`. */
  readonly errorBajas = signal<FichaFailure | null>(null);

  /** Lines of the loading block. */
  protected readonly skeletons = Array.from({ length: SKELETON_LINES }, (_, index) => index);

  /** Lines of the absence history loading block. */
  protected readonly bajaSkeletons = Array.from(
    { length: BAJAS_SKELETON_LINES },
    (_, index) => index,
  );

  /**
   * Termination is only offered for a loaded, active worker.
   *
   * The act cannot be repeated: the backend answers `409` for an inactive one,
   * and a button that can only fail is a trap. While the record is missing there
   * is nothing that says whether the worker is active, so it stays locked too.
   */
  readonly bajaBloqueada = computed(() => {
    const record = this.ficha();
    return record === null || record.gestion_interna.activo === false;
  });

  /** Label of the termination action: the state is visible, not only the color. */
  readonly etiquetaBaja = computed(() =>
    this.ficha()?.gestion_interna.activo === false ? 'Ya está dado de baja' : 'Dar de baja',
  );

  /** Why the action cannot be pressed, said out loud on hover. */
  readonly tituloBaja = computed(() => {
    const record = this.ficha();
    if (record === null) {
      return 'Espera a que cargue la ficha.';
    }
    if (record.gestion_interna.activo === false) {
      return 'Ya está dado de baja: la baja no se puede repetir.';
    }
    return 'Dar de baja al trabajador';
  });

  /** `num_empleado — nombre`, as the termination layer presents the subject. */
  readonly etiquetaEmpleado = computed(() => {
    const identificacion = this.ficha()?.identificacion;
    if (identificacion === undefined) {
      return null;
    }

    const numero = identificacion.num_empleado.trim();
    const nombre = identificacion.nombre.trim();
    const partes = [numero, nombre].filter((parte) => parte !== '');

    return partes.length > 0 ? partes.join(' — ') : null;
  });

  /**
   * Every request the panel wants to send.
   *
   * `switchMap` keeps one in flight: a newer open cancels the one it supersedes,
   * so a slow answer for the previous worker never lands over the current one.
   */
  private readonly requests = new Subject<number | null>();
  private readonly bajaRequests = new Subject<number | null>();
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.clearCloseTimer());

    this.requests
      .pipe(
        switchMap((id) => (id === null ? EMPTY : this.request(id))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (ficha) => {
          this.ficha.set(ficha);
          this.error.set(null);
        },
      });

    this.bajaRequests
      .pipe(
        switchMap((id) => (id === null ? EMPTY : this.requestBajas(id))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (bajas) => {
          this.bajas.set(bajas);
          this.errorBajas.set(null);
        },
      });

    effect(() => {
      const isOpen = this.open();
      const id = this.empleadoId();

      if (!isOpen) {
        // Cancel any in-flight request immediately, while keeping the current
        // snapshot during the drawer's 300ms exit transition.
        this.requests.next(null);
        this.bajaRequests.next(null);
        this.loading.set(false);
        this.loadingBajas.set(false);
        this.scheduleClearOnClose();
        return;
      }

      this.clearCloseTimer();
      if (id !== null) {
        this.load(id);
      }
    });
  }

  private clearCloseTimer(): void {
    if (this.closeTimer !== null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  private scheduleClearOnClose(): void {
    this.clearCloseTimer();
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      if (!this.open()) {
        this.ficha.set(null);
        this.error.set(null);
        this.bajas.set([]);
        this.errorBajas.set(null);
      }
    }, 300);
  }

  /** Retry of the alert: asks for the record on screen again. */
  protected reintentar(): void {
    const id = this.empleadoId();
    if (id !== null) {
      this.load(id);
    }
  }

  /** Opens the termination layer, unless the worker cannot be terminated. */
  protected abrirBaja(): void {
    if (this.bajaBloqueada()) {
      return;
    }
    this.bajaAbierta.set(true);
  }

  /** Emits edit request when an edit workflow is wired via `puedeEditar`. */
  protected solicitarEdicion(): void {
    const id = this.ficha()?.id;
    if (id !== undefined && this.puedeEditar()) {
      this.editarSolicitado.emit(id);
    }
  }

  /**
   * The termination layer succeeded: the panel says so and leaves.
   *
   * The record on screen is now history, so keeping it open would show a worker
   * the roster no longer lists and an `Activo` pill that is no longer true.
   */
  protected alRegistrarBaja(): void {
    this.bajaRegistrada.emit();
    this.open.set(false);
  }

  /** Formats a date of the API, or the placeholder when there is none. */
  protected fecha(value: string | null): string {
    const raw = value?.trim();
    if (!raw) {
      return NO_VALUE;
    }

    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (parts === null) {
      // An unexpected shape is shown verbatim: inventing a date would be worse
      // than showing the string the backend sent.
      return raw;
    }

    const date = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
    return DATE_FORMAT.format(date);
  }

  /** Prints a string of the record, or the placeholder when it is absent. */
  protected texto(value: string | null): string {
    const raw = value?.trim();
    return raw ? raw : NO_VALUE;
  }

  /** Prints a figure of the record. `0` is a real answer, so it is kept. */
  protected numero(value: number | null): string {
    return typeof value === 'number' ? String(value) : NO_VALUE;
  }

  /**
   * Word of the traffic light. The pill paints it too, but the word is what
   * carries the state on a grayscale screen or for a colour-blind reader.
   */
  protected etiquetaExpediente(estado: EstadoExpediente): string {
    switch (estado) {
      case 'completo':
        return 'Completo';
      case 'casi_completo':
        return 'Casi completo';
      case 'incompleto':
        return 'Incompleto';
    }
  }

  /**
   * Sentence that counts the missing fields. Their names are not part of it any
   * more: each one is a chip beside the sentence, so a long list wraps instead
   * of running past the edge of the panel.
   */
  protected faltantes(expediente: FichaEstadoExpediente): string {
    const total = expediente.total_faltantes;
    return total === 1 ? 'Falta 1 campo' : `Faltan ${total} campos`;
  }

  /** Names of the missing fields, as the backend spells them. */
  protected camposFaltantes(expediente: FichaEstadoExpediente): string[] {
    return Array.isArray(expediente.campos_faltantes) ? expediente.campos_faltantes : [];
  }

  /** Asks again after a transient failure without replacing the already loaded record. */
  protected reintentarBajas(): void {
    const id = this.empleadoId();
    if (id !== null) {
      this.bajas.set([]);
      this.bajaRequests.next(id);
    }
  }

  /** Human label of an absence row type (`licencia` vs `definitiva`). */
  protected etiquetaTipoBaja(tipo: TipoBajaHistorial | null): string {
    switch (tipo) {
      case 'licencia':
        return 'Licencia temporal';
      case 'definitiva':
        return 'Baja definitiva';
      default:
        return 'Movimiento de baja';
    }
  }

  /** Pill tone for one row of the termination history. */
  protected estadoPillBaja(baja: HistorialBaja): StatusPillTone {
    if (baja.vigente) {
      return baja.tipo === 'licencia' ? 'casi_completo' : 'baja';
    }
    return 'completo';
  }

  /** Word paired with `estadoPillBaja` so color is never the only signal. */
  protected etiquetaVigenciaBaja(baja: HistorialBaja): string {
    if (baja.vigente) {
      return 'Vigente';
    }
    return baja.reactivado_por ? 'Reactivada' : 'Concluida';
  }

  /** Formats the `[desde, hasta]` interval of one baja record in `es-MX`. */
  protected periodoBaja(baja: HistorialBaja): string {
    const desde = this.fecha(baja.desde);
    if (desde === NO_VALUE) {
      return NO_VALUE;
    }
    if (baja.hasta) {
      return `${desde} — ${this.fecha(baja.hasta)}`;
    }
    return baja.vigente ? `Desde el ${desde} (en curso)` : desde;
  }

  /** Maps a contract key (`curp`) to the same Spanish label used by FaltantesDrawer. */
  protected etiquetaCampo(campo: string): string {
    return etiquetaCampoExpediente(campo);
  }

  /** Clears what the previous record showed and asks for the new one. */
  private load(id: number): void {
    this.ficha.set(null);
    this.bajas.set([]);
    this.requests.next(id);
    this.bajaRequests.next(id);
  }

  /**
   * One request, with `loading` and the failure mapped as it comes back.
   *
   * On failure the record stays empty: the alert explains what went wrong, and
   * keeping the previous worker's data under a different heading would attribute
   * someone else's plaza to the id on screen.
   */
  private request(id: number): Observable<FichaEmpleado> {
    this.loading.set(true);
    this.error.set(null);

    return this.fichaService.consultar(id).pipe(
      catchError((error: unknown) => {
        this.error.set(this.mapHttpError(error, 'ficha'));
        return EMPTY;
      }),
      finalize(() => this.loading.set(false)),
    );
  }

  /** Loads the chronological absence log alongside the main record. */
  private requestBajas(id: number): Observable<HistorialBaja[]> {
    this.loadingBajas.set(true);
    this.errorBajas.set(null);

    return this.fichaService.consultarBajas(id).pipe(
      catchError((error: unknown) => {
        this.errorBajas.set(this.mapHttpError(error, 'bajas'));
        return EMPTY;
      }),
      finalize(() => this.loadingBajas.set(false)),
    );
  }

  /** Maps an HTTP failure to the sentence and the action the user gets. */
  private mapHttpError(error: unknown, scope: 'ficha' | 'bajas'): FichaFailure {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const code = this.errorCode(error);

    switch (status) {
      case 401:
        // The body says `Unauthenticated.`, which is not copy: English, and it
        // names a protocol rather than the situation.
        return { status, mensaje: MESSAGE_SESSION, detalle: null, accion: 'ninguna' };
      case 403:
        return {
          status,
          mensaje: scope === 'bajas' ? MESSAGE_BAJAS_PERMISSION : MESSAGE_PERMISSION,
          detalle: code,
          accion: 'ninguna',
        };
      case 404:
        return {
          status,
          mensaje: MESSAGE_NOT_FOUND,
          detalle: this.bodyMessage(error),
          accion: 'ninguna',
        };
      default:
        return {
          status,
          mensaje: MESSAGE_CONNECTION,
          detalle: null,
          accion: 'reintentar',
        };
    }
  }

  /** Reads `codigo` out of the error body without trusting its shape. */
  private errorCode(error: unknown): string | null {
    if (!(error instanceof HttpErrorResponse)) {
      return null;
    }
    const body = error.error as FichaError | null;
    return typeof body?.codigo === 'string' ? body.codigo : null;
  }

  /** Reads the backend sentence out of the error body, when it carries one. */
  private bodyMessage(error: unknown): string | null {
    if (!(error instanceof HttpErrorResponse)) {
      return null;
    }
    const body = error.error as FichaError | null;
    return typeof body?.message === 'string' ? body.message : null;
  }
}
