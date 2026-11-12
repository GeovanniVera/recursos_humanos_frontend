import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { EMPTY, Observable, Subject, catchError, debounceTime, finalize, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { PadronError, PadronResponse } from '../../core/padron/padron.models';
import { PadronService } from '../../core/padron/padron.service';
import { Button } from '../../shared/ui/button/button.component';
import { DataTable, TableColumn, TableRow } from '../../shared/ui/data-table/data-table.component';
import { FichaDrawer } from './ficha-drawer/ficha-drawer.component';

/**
 * Own copy of the screen. Each failure below is a different situation for the
 * user, so each one gets its own sentence and its own action; a single
 * "something went wrong" would throw away that distinction.
 */
const MENSAJE_SESION = 'Tu sesión venció. Volvé a iniciar sesión.';
const MENSAJE_PERMISO = 'No tenés permisos para consultar el padrón.';
const MENSAJE_SERVICIO = 'El servicio no está disponible. Reintentá en unos segundos.';
const MENSAJE_CONEXION = 'No pudimos conectar con el servidor. Revisá tu conexión.';
/** Throttle without a number from the backend: there is no countdown to show. */
const MENSAJE_LIMITE = 'Hiciste demasiadas consultas. Esperá un momento antes de reintentar.';

/** Silence that turns typing into a search. */
const RETRASO_BUSQUEDA = 300;

/** Page size of the roster. The contract allows up to 100. */
const POR_PAGINA = 10;

/** Sizes the control offers. The backend rejects anything above 100. */
const TAMANOS_PAGINA = [10, 20, 50, 100] as const;

/**
 * Placeholder for a value that is not known: an employee with no area, or a
 * figure that the first answer has not brought yet. Never `0`, because zero is
 * a real answer of this API.
 */
const SIN_DATO = '—';

/**
 * What the alert offers the user.
 * - `reintentar`: another request may succeed (server, network or throttle).
 * - `iniciar-sesion`: the token is gone, retrying is pointless.
 * - `ninguna`: the answer is final until an administrator grants access.
 */
type PadronErrorAction = 'reintentar' | 'iniciar-sesion' | 'ninguna';

/** Failure of the roster, already translated into copy and into an action. */
interface FallaPadron {
  /** HTTP status, or `0` when the request never reached the server. */
  status: number;
  /** Sentence the user reads. */
  mensaje: string;
  /** Contract code from the body (`permiso_denegado`, …), when there is one. */
  codigo: string | null;
  accion: PadronErrorAction;
}

/**
 * Active employees, reachable at `/empleados/activos`.
 *
 * The backend filters the listing itself — `ConsultarPadron` runs
 * `where('activo', true)->whereNull('fecha_baja')` — so this screen never has to
 * hide rows: every employee the endpoint returns is active. Paging and search
 * are asked to the server, which is the only side that knows the real totals.
 *
 * The screen owns all of the state — the service holds none — so the request
 * that goes out is always the one described by the controls on screen.
 */
@Component({
  selector: 'app-empleados-page',
  imports: [Button, DataTable, FichaDrawer, RouterLink],
  templateUrl: './empleados-page.component.html',
  styleUrl: './empleados-page.component.scss',
})
export class EmpleadosPage {
  private readonly padronService = inject(PadronService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Term of the search field, as typed. */
  readonly buscar = signal('');

  /** Page on screen, 1-based. */
  readonly pagina = signal(1);

  /** Page size, driven by the "Filas por página" control. */
  readonly porPagina = signal(POR_PAGINA);

  /** Sizes offered by that control. */
  readonly tamanosPagina = TAMANOS_PAGINA;

  /** Last page the backend served, or `null` before the first answer. */
  readonly padron = signal<PadronResponse | null>(null);

  /** `true` while a page is in flight. */
  readonly loading = signal(false);

  /** Last failure, or `null`. */
  readonly error = signal<FallaPadron | null>(null);

  /** Seconds left before a `429` lets the user ask again; `0` when free. */
  readonly espera = signal(0);

  /**
   * Internal key of the employee whose record is open, or `null`.
   *
   * It is the id of the row, not `num_empleado`: the record endpoint is
   * addressed by the primary key, and the roster row carries both.
   */
  readonly fichaId = signal<number | null>(null);

  /** Whether the record panel is open. Two-way bound to it. */
  readonly fichaAbierta = signal(false);

  /** One formatter for every count, so the three figures group digits alike. */
  private readonly formato = new Intl.NumberFormat('es-MX');

  /** Columns of the roster, in the order the canvas lists them. */
  readonly columnas: readonly TableColumn[] = [
    { key: 'num_empleado', header: 'Núm. empleado', align: 'end' },
    { key: 'nombre', header: 'Nombre' },
    { key: 'area', header: 'Área' },
    { key: 'estado', header: 'Estado' },
  ];

  /**
   * Rows of the table, flattened to the four printable fields.
   *
   * The table takes plain records on purpose, so the domain shape stops here:
   * an employee with no area arrives as `null` and leaves as the placeholder the
   * column shows.
   */
  readonly filas = computed<readonly TableRow[]>(() =>
    (this.padron()?.datos ?? []).map((empleado) => ({
      id: empleado.id,
      num_empleado: empleado.num_empleado,
      nombre: empleado.nombre,
      area: empleado.area?.nombre ?? SIN_DATO,
      estado: empleado.estado,
    })),
  );

  /** Emptiness has two causes, and the message has to name the right one. */
  readonly mensajeVacio = computed(() =>
    this.buscar().trim().length > 0
      ? 'No hay empleados que coincidan con la búsqueda.'
      : 'Todavía no hay empleados activos.',
  );

  /** Pages the backend reported. `0` before the first answer, so both ends lock. */
  readonly totalPaginas = computed(() => this.padron()?.meta.total_paginas ?? 0);

  /**
   * Page the backend served last, or `0` before the first answer.
   *
   * The pager moves relative to this figure and not to the page that was
   * requested: after a failed request the two differ, and stepping from the page
   * on screen is the only move that never skips one.
   */
  readonly paginaActual = computed(() => this.padron()?.meta.pagina ?? 0);

  /** `Mostrando 1–20 de 42`. */
  readonly rango = computed(() => {
    const respuesta = this.padron();
    if (respuesta === null) {
      return SIN_DATO;
    }

    const { pagina, por_pagina, total } = respuesta.meta;
    if (total === 0) {
      return 'Sin empleados';
    }

    const desde = (pagina - 1) * por_pagina + 1;
    const hasta = Math.min(pagina * por_pagina, total);
    return `Mostrando ${this.formato.format(desde)}–${this.formato.format(hasta)} de ${this.formato.format(total)}`;
  });

  /** `Página 1 de 3`. Never `de 0`: an empty roster still has one page. */
  readonly etiquetaPagina = computed(() => {
    const meta = this.padron()?.meta;
    if (meta === undefined) {
      return SIN_DATO;
    }
    const total = Math.max(meta.total_paginas, 1);
    return `Página ${this.formato.format(meta.pagina)} de ${this.formato.format(total)}`;
  });

  /** True at the first page, while loading, and before the first answer. */
  readonly anteriorDeshabilitado = computed(() => this.loading() || this.paginaActual() <= 1);

  /** True on the last page, while loading, and before the first answer. */
  readonly siguienteDeshabilitado = computed(
    () => this.loading() || this.paginaActual() >= this.totalPaginas(),
  );

  /**
   * Every request the screen wants to send.
   *
   * `switchMap` below keeps one request in flight: a newer one cancels the one
   * it supersedes, so a slow answer never lands over a newer page.
   */
  private readonly solicitudes = new Subject<void>();

  /**
   * Terms typed into the search field, before the silence that turns them into
   * a request. The debounce lives on this stream so `takeUntilDestroyed` drops
   * a pending term when the screen goes away.
   */
  private readonly terminos = new Subject<string>();

  private relojId: ReturnType<typeof setInterval> | null = null;

  /**
   * A request the `429` wait did not let through.
   *
   * Dropping it would leave the field showing a term whose results never
   * arrive, so it is remembered and sent when the clock runs out.
   */
  private diferida = false;

  constructor() {
    this.terminos
      .pipe(debounceTime(RETRASO_BUSQUEDA), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.solicitar());

    this.solicitudes
      .pipe(
        switchMap(() => this.pedirPagina()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (respuesta) => {
          this.padron.set(respuesta);
          // An answer arrived, so whatever wait the API asked for is over.
          this.limpiarEspera();
          this.ajustarPaginaVacia(respuesta);
        },
      });

    this.destroyRef.onDestroy(() => this.detenerReloj());

    // First page on entry: the screen has no data of its own to restore.
    this.solicitar();
  }

  /** Reads the field into state and restarts the search from the first page. */
  alBuscar(event: Event): void {
    const termino = (event.target as HTMLInputElement).value;
    this.buscar.set(termino);
    // A new term is a new result set: page 3 of the previous one means nothing.
    this.pagina.set(1);
    this.terminos.next(termino);
  }

  /** Asks for the page on screen again. Also the retry of the alert. */
  solicitar(): void {
    if (this.espera() > 0) {
      // The API asked for silence: the request waits for the clock instead of
      // being thrown away, so a term typed during the wait is not lost.
      this.diferida = true;
      return;
    }
    this.solicitudes.next();
  }

  /**
   * Moves to a page, refusing the two ends of the range: page `0` and a page
   * past `total_paginas` both exist only as bugs, never as data.
   */
  irA(destino: number): void {
    if (this.loading() || destino < 1 || destino > this.totalPaginas()) {
      return;
    }
    if (destino === this.paginaActual()) {
      return;
    }

    this.pagina.set(destino);
    this.solicitar();
  }

  /**
   * Opens the record of a row.
   *
   * The table hands the whole row back, so the id is read here instead of being
   * recomputed from the page: the row is what the user clicked, and a page that
   * moved underneath it would point at another employee.
   */
  abrirFicha(fila: TableRow): void {
    const id = fila['id'];

    if (typeof id !== 'number') {
      return;
    }

    this.fichaId.set(id);
    this.fichaAbierta.set(true);
  }

  /**
   * Keyboard path of the same action: the name of a cell is a real `<button>`,
   * and its click bubbles up to the row. Stopping it keeps one activation from
   * opening the panel twice — and a button that fires the row handler on the way
   * up would also fire it for a click that was never meant as a row click.
   */
  abrirFichaDesdeNombre(event: Event, fila: TableRow): void {
    event.stopPropagation();
    this.abrirFicha(fila);
  }

  /** Drops the local session and returns to the door. */
  iniciarSesion(): void {
    this.auth.limpiarSesionLocal();
    void this.router.navigate(['/login']);
  }

  /**
   * Asks for the page on screen again after a termination.
   *
   * The roster endpoint filters `activo = true AND fecha_baja IS NULL`, so the
   * worker that was just terminated has to disappear: keeping the table on
   * screen would show someone the backend no longer lists.
   */
  alRegistrarBaja(): void {
    this.solicitar();
  }

  /**
   * Changes how many rows a page holds.
   *
   * Page 3 of ten rows is not page 3 of fifty: the size change restarts at the
   * first page instead of landing somewhere the user never asked for.
   */
  cambiarPorPagina(event: Event): void {
    const valor = Number((event.target as HTMLSelectElement).value);

    if (!Number.isFinite(valor) || valor === this.porPagina()) {
      return;
    }

    this.porPagina.set(valor);
    this.pagina.set(1);
    this.solicitar();
  }

  /**
   * One request, with `loading` and the failure mapped as it comes back.
   *
   * On failure the last page stays on screen: the alert explains what went
   * wrong, while an empty table under it would claim the roster is empty, which
   * is a different and false sentence.
   */
  private pedirPagina(): Observable<PadronResponse> {
    this.loading.set(true);
    this.error.set(null);

    return this.padronService
      .consultar({
        buscar: this.buscar(),
        pagina: this.pagina(),
        porPagina: this.porPagina(),
      })
      .pipe(
        catchError((error: unknown) => {
          this.manejarError(error);
          return EMPTY;
        }),
        finalize(() => this.loading.set(false)),
      );
  }

  /** Maps an HTTP failure to the sentence and the action the user gets. */
  private manejarError(error: unknown): void {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const codigo = this.codigoDe(error);

    switch (status) {
      case 401:
        this.error.set({ status, mensaje: MENSAJE_SESION, codigo, accion: 'iniciar-sesion' });
        return;
      case 403:
        this.error.set({ status, mensaje: MENSAJE_PERMISO, codigo, accion: 'ninguna' });
        return;
      case 429: {
        // The backend says how long to wait; adopt its number instead of a guess.
        const segundos = this.segundosDeEspera(error);
        this.error.set({
          status,
          mensaje:
            segundos === null
              ? MENSAJE_LIMITE
              : `Hiciste demasiadas consultas. Esperá ${segundos} segundos.`,
          codigo,
          accion: 'reintentar',
        });
        if (segundos !== null) {
          this.iniciarEspera(segundos);
        }
        return;
      }
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
    const cuerpo = error.error as PadronError | null;
    return typeof cuerpo?.codigo === 'string' ? cuerpo.codigo : null;
  }

  /**
   * Steps back one page when the page on screen no longer exists.
   *
   * Terminating the last worker of the last page leaves the requested page past
   * the end of the list: the answer arrives with no rows and a page number the
   * pager cannot reconcile. The move is one page back, never to the first one.
   */
  private ajustarPaginaVacia(respuesta: PadronResponse): void {
    const total = respuesta.meta.total_paginas;

    if (total > 0 && respuesta.meta.pagina > total) {
      this.pagina.set(total);
      this.solicitudes.next();
    }
  }

  /** Reads the wait out of a `429` body, or `null` when it carries no number. */
  private segundosDeEspera(error: unknown): number | null {
    if (!(error instanceof HttpErrorResponse)) {
      return null;
    }
    const cuerpo = error.error as PadronError | null;
    const segundos = cuerpo?.reintentar_en_segundos;
    return typeof segundos === 'number' && segundos > 0 ? segundos : null;
  }

  /** Locks the retry until the announced wait is over, counting down in place. */
  private iniciarEspera(segundos: number): void {
    this.detenerReloj();
    this.espera.set(segundos);

    this.relojId = setInterval(() => {
      const restantes = this.espera() - 1;
      this.espera.set(Math.max(restantes, 0));
      if (restantes <= 0) {
        this.detenerReloj();
        this.liberarDiferida();
      }
    }, 1000);
  }

  /** Sends the request the wait held back, if there was one. */
  private liberarDiferida(): void {
    if (!this.diferida) {
      return;
    }
    this.diferida = false;
    this.solicitudes.next();
  }

  /** Ends the wait without touching the visible message. */
  private detenerReloj(): void {
    if (this.relojId !== null) {
      clearInterval(this.relojId);
      this.relojId = null;
    }
  }

  /** Ends the wait and releases the retry button. */
  private limpiarEspera(): void {
    this.detenerReloj();
    this.espera.set(0);
    this.diferida = false;
  }
}
