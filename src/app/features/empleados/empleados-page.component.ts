import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { PadronBufferStore } from '../../core/padron/padron-buffer.store';
import { PadronError } from '../../core/padron/padron.models';
import { validarBusqueda } from '../../core/padron/validacion-busqueda';
import { AlertBanner } from '../../shared/ui/alert-banner/alert-banner.component';
import { Button } from '../../shared/ui/button/button.component';
import { DataTable, TableColumn, TableRow } from '../../shared/ui/data-table/data-table.component';
import { Pagination } from '../../shared/ui/pagination/pagination.component';
import { RowFlag } from '../../shared/ui/row-flag/row-flag.component';
import { RowLink } from '../../shared/ui/row-link/row-link.component';
import { FichaDrawer } from './ficha-drawer/ficha-drawer.component';

/**
 * Own copy of the screen. Each failure below is a different situation for the
 * user, so each one gets its own sentence and its own action; a single
 * "something went wrong" would throw away that distinction.
 */
const MENSAJE_SESION = 'Tu sesión venció. Vuelve a iniciar sesión.';
const MENSAJE_PERMISO = 'No tienes permisos para consultar el padrón.';
const MENSAJE_SERVICIO = 'El servicio no está disponible. Reintenta en unos segundos.';
const MENSAJE_CONEXION = 'No pudimos conectar con el servidor. Revisa tu conexión.';
/** Throttle without a number from the backend: there is no countdown to show. */
const MENSAJE_LIMITE = 'Hiciste demasiadas consultas. Espera un momento antes de reintentar.';
const MENSAJE_PARAMETROS = 'Los parámetros de consulta no son válidos.';

/** Silence that turns typing into a search. */
const RETRASO_BUSQUEDA = 300;

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
 * - `ninguna`: the answer is final until the user changes the criteria.
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
  /** Seconds the API asked to wait after a `429`; `null` when it sent no number. */
  segundos: number | null;
}

/**
 * Active employees, reachable at `/empleados/activos`.
 *
 * Paging has two levels. The user sees 20 rows at a time; the store asks the
 * backend for 100 records per request and serves five logical pages out of that
 * block. Moving inside the window is a local slice and sends no request; the
 * sixth page fetches the next block once.
 *
 * The screen owns the controls and the presentation. The list, the cache, the
 * page/block math and the cancellation live in `PadronBufferStore`, so this
 * component only maps rows, errors and counts to the design system.
 *
 * The page lives in `?pagina=` so a deep link and the browser's back button
 * work. The search term deliberately does not: the backend avoids writing it
 * in its audit log, and putting it in the URL would write it into the browser
 * history instead.
 */
@Component({
  selector: 'app-empleados-page',
  imports: [AlertBanner, Button, DataTable, FichaDrawer, Pagination, RouterLink, RowFlag, RowLink],
  templateUrl: './empleados-page.component.html',
  styleUrl: './empleados-page.component.scss',
  // One buffer per visit: filter, page and cached blocks are not shared with a
  // second tab or with a later visit to the screen.
  providers: [PadronBufferStore],
})
export class EmpleadosPage {
  private readonly store = inject(PadronBufferStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  /** Term of the search field, as typed. */
  readonly buscar = signal('');

  /** Client-side complaint about the term, or `null`. */
  readonly errorBusqueda = signal<string | null>(null);

  /** Complaint about the "Ir a página" field, or `null`. */
  readonly errorPagina = signal<string | null>(null);

  /** Seconds left before a `429` lets the user ask again; `0` when free. */
  readonly espera = signal(0);

  /** Sizes offered by the page-size control. */
  readonly tamanosPagina = TAMANOS_PAGINA;

  /** Logical page on screen. */
  readonly paginaActual = this.store.pagina;

  /** Logical page size, driven by the "Filas por página" control. */
  readonly porPagina = this.store.porPagina;

  /** Logical pages, derived from `total`; the backend counts blocks instead. */
  readonly totalPaginas = this.store.totalPaginas;

  /** Whether a block has been served, which is not the same as `total > 0`. */
  readonly hayDatos = this.store.hayDatos;

  readonly cargandoInicial = this.store.cargandoInicial;
  readonly cargandoBloque = this.store.cargandoBloque;
  readonly cargando = this.store.cargando;

  /** Page the in-flight block (or the failed one) is trying to reach. */
  readonly paginaObjetivo = this.store.paginaObjetivo;

  /**
   * Internal key of the employee whose record is open, or `null`.
   *
   * It is the id of the row, not `num_empleado`: the record endpoint is
   * addressed by the primary key, and the roster row carries both.
   */
  readonly fichaId = signal<number | null>(null);

  /** Whether the record panel is open. Two-way bound to it. */
  readonly fichaAbierta = signal(false);

  /** One formatter for every count, so the figures group digits alike. */
  private readonly formato = new Intl.NumberFormat('es-MX');

  /**
   * Terms typed into the search field, before the silence that turns them into
   * a request. The debounce lives on this stream so `takeUntilDestroyed` drops
   * a pending term when the screen goes away.
   */
  private readonly terminos = new Subject<string>();

  private relojId: ReturnType<typeof setInterval> | null = null;

  /**
   * A search the `429` wait did not let through.
   *
   * Dropping it would leave the field showing a term whose results never
   * arrive, so it is remembered and applied when the clock runs out.
   */
  private busquedaDiferida: string | null = null;

  /** Page the URL currently names, to keep the URL effect from looping. */
  private paginaEnUrl = 1;

  /** Failure mapped to copy and to the action the alert offers. */
  readonly falla = computed<FallaPadron | null>(() => this.describirError(this.store.error()));

  /** Columns of the roster, in the order the canvas lists them. */
  readonly columnas: readonly TableColumn[] = [
    { key: 'num_empleado', header: 'Núm. empleado', align: 'end' },
    { key: 'nombre', header: 'Nombre' },
    { key: 'area', header: 'Área' },
  ];

  /**
   * Rows of the table, flattened to the printable fields plus the state.
   *
   * The table takes plain records on purpose, so the domain shape stops here:
   * an employee with no area arrives as `null` and leaves as the placeholder the
   * column shows. `estado` stays in the payload although it is not a column: the
   * leading flag of the row is painted from it.
   */
  readonly filas = computed<readonly TableRow[]>(() =>
    this.store.filas().map((empleado) => ({
      id: empleado.id,
      num_empleado: empleado.num_empleado,
      nombre: empleado.nombre,
      area: empleado.area?.nombre ?? SIN_DATO,
      estado: empleado.estado,
    })),
  );

  /** Emptiness has three causes, and the message has to name the right one. */
  readonly mensajeVacio = computed(() => {
    if (this.falla() !== null && !this.hayDatos()) {
      return 'No se pudo cargar el padrón.';
    }
    return this.store.buscar().trim().length > 0
      ? 'No hay empleados que coincidan con la búsqueda.'
      : 'Todavía no hay empleados activos.';
  });

  /** `Mostrando 1–20 de 250`. */
  readonly rango = computed(() => {
    if (!this.hayDatos()) {
      return SIN_DATO;
    }

    const total = this.store.total();
    if (total === 0) {
      return 'Sin empleados';
    }

    return `Mostrando ${this.formato.format(this.store.desde())}–${this.formato.format(this.store.hasta())} de ${this.formato.format(total)}`;
  });

  /** `Página 1 de 13`. Never `de 0`: an empty roster still has one page. */
  readonly etiquetaPagina = computed(() => {
    if (!this.hayDatos()) {
      return SIN_DATO;
    }
    const total = Math.max(this.store.totalPaginas(), 1);
    return `Página ${this.formato.format(this.store.pagina())} de ${this.formato.format(total)}`;
  });

  /** Upper bound of the "Ir a página" field. */
  readonly totalPaginasMax = computed(() => Math.max(this.store.totalPaginas(), 1));

  /** A load or a throttle wait freezes every control that would ask for a block. */
  readonly controlesDeshabilitados = computed(() => this.cargando() || this.espera() > 0);

  readonly primeraDeshabilitado = computed(
    () => this.controlesDeshabilitados() || this.store.pagina() <= 1,
  );

  readonly anteriorDeshabilitado = computed(
    () => this.controlesDeshabilitados() || !this.store.hayAnterior(),
  );

  readonly siguienteDeshabilitado = computed(
    () => this.controlesDeshabilitados() || !this.store.haySiguiente(),
  );

  readonly ultimaDeshabilitado = computed(
    () => this.controlesDeshabilitados() || this.store.pagina() >= this.store.totalPaginas(),
  );

  constructor() {
    const paginaUrl = this.route.snapshot.queryParamMap.get('pagina');
    const paginaInicial = this.paginaDeUrl(paginaUrl);
    this.paginaEnUrl = paginaInicial;
    this.store.iniciar(paginaInicial);

    // Normalize a page the URL invented (`0`, `abc`, `06`). A valid value is
    // left untouched so opening the screen does not add a history entry.
    if (paginaUrl !== null && String(paginaInicial) !== paginaUrl) {
      void this.sincronizarUrl(paginaInicial, true);
    }

    this.terminos
      .pipe(debounceTime(RETRASO_BUSQUEDA), takeUntilDestroyed(this.destroyRef))
      .subscribe((termino) => this.aplicarTermino(termino));

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => this.alCambiarUrl(params.get('pagina')));

    // A page change that came from the buffer (cache hit or a new block) has to
    // reach the URL. The guard keeps the query subscription from echoing it.
    effect(() => {
      const pagina = this.store.pagina();
      if (pagina === this.paginaEnUrl) {
        return;
      }
      this.paginaEnUrl = pagina;
      void this.sincronizarUrl(pagina, false);
    });

    // A failed jump must not leave the URL naming a page the screen never
    // reached. The retry still remembers its target inside the buffer.
    effect(() => {
      if (this.falla() === null || this.cargando()) {
        return;
      }
      const visible = this.store.pagina();
      if (visible !== this.paginaEnUrl) {
        this.paginaEnUrl = visible;
        void this.sincronizarUrl(visible, true);
      }
    });

    // The countdown is a side effect of the failure, not of rendering. The
    // effect only tracks the mapped failure, so a tick of `espera` does not
    // restart it.
    effect(() => {
      const fallo = this.falla();
      if (fallo === null) {
        this.limpiarEspera();
        return;
      }
      if (fallo.status === 429 && fallo.segundos !== null) {
        this.iniciarEspera(fallo.segundos);
        return;
      }
      this.detenerReloj();
      this.espera.set(0);
    });

    this.destroyRef.onDestroy(() => this.detenerReloj());
  }

  /** Reads the field into state and schedules the search. */
  alBuscar(event: Event): void {
    const termino = (event.target as HTMLInputElement).value;
    this.buscar.set(termino);
    // Immediate feedback, before the debounce: the field explains the format
    // while the user is still deciding what to type.
    this.errorBusqueda.set(validarBusqueda(termino));
    this.errorPagina.set(null);
    this.terminos.next(termino);
  }

  /** Asks for the current block again. Also the retry of the refresh action. */
  solicitar(): void {
    if (this.espera() > 0) {
      return;
    }
    this.errorPagina.set(null);
    this.store.recargar();
  }

  /** Retries the block that failed, which may be a page different from this one. */
  reintentar(): void {
    if (this.espera() > 0) {
      return;
    }
    this.store.reintentar();
  }

  /**
   * Moves to a page. Inside the cached block this is a local slice and sends no
   * request; outside it starts one and keeps the current rows until it arrives.
   */
  irA(destino: number): void {
    if (this.espera() > 0) {
      return;
    }
    this.errorPagina.set(null);
    this.store.irAPagina(destino);
  }

  irAPrimera(): void {
    this.irA(1);
  }

  irAUltima(): void {
    this.irA(this.store.totalPaginas());
  }

  /**
   * Jump from the "Ir a página" field.
   *
   * The field is a real number input with the range as its `max`, but a number
   * input still accepts typed values, so the range is checked again here.
   */
  irAPaginaDesdeCampo(event: Event, valor: string): void {
    event.preventDefault();
    this.irAPaginaValor(valor);
  }

  irAPaginaValor(valor: string): void {
    if (this.espera() > 0) {
      return;
    }

    const destino = Number(valor);
    const maximo = this.totalPaginasMax();

    if (!Number.isInteger(destino) || destino < 1 || destino > maximo) {
      this.errorPagina.set(`Ingresa un número entre 1 y ${this.formato.format(maximo)}.`);
      return;
    }

    this.errorPagina.set(null);
    this.store.irAPagina(destino);
  }

  /**
   * Changes how many rows a page holds.
   *
   * A different logical size is a different window over the same block, so the
   * buffer drops its cache and restarts at page 1.
   */
  cambiarPorPagina(event: Event): void {
    const valor = Number((event.target as HTMLSelectElement).value);
    this.cambiarTamanoPagina(valor);
  }

  cambiarTamanoPagina(valor: number): void {
    if (!Number.isFinite(valor) || valor === this.store.porPagina()) {
      return;
    }

    this.errorPagina.set(null);
    this.store.cambiarPorPagina(valor);
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
   * Asks for the roster again after a termination.
   *
   * The endpoint filters `activo = true AND fecha_baja IS NULL`, so the worker
   * that was just terminated has to disappear. The refresh keeps the current
   * rows while the new block travels.
   */
  alRegistrarBaja(): void {
    this.errorPagina.set(null);
    this.store.recargar();
  }

  /** Validates the typed term and either schedules it or explains the format. */
  private aplicarTermino(termino: string): void {
    const mensaje = validarBusqueda(termino);
    this.errorBusqueda.set(mensaje);

    if (mensaje !== null) {
      return;
    }

    if (this.espera() > 0) {
      // The API asked for silence: the request waits for the clock instead of
      // being thrown away, so a term typed during the wait is not lost.
      this.busquedaDiferida = termino;
      return;
    }

    this.aplicarBusqueda(termino);
  }

  private aplicarBusqueda(termino: string): void {
    const normalizado = termino.trim();
    if (normalizado === this.store.buscar()) {
      return;
    }

    this.busquedaDiferida = null;
    this.errorPagina.set(null);
    this.store.aplicarBusqueda(normalizado);
  }

  /** Maps an HTTP failure to the sentence and the action the user gets. */
  private describirError(error: unknown): FallaPadron | null {
    if (error === null) {
      return null;
    }

    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const codigo = this.codigoDe(error);

    switch (status) {
      case 400: {
        // Our client-side mirror should catch the term before it travels, but a
        // stricter backend is still possible. Its sentence is the one to show,
        // and the typed term stays in the field.
        const cuerpo = error instanceof HttpErrorResponse ? (error.error as PadronError | null) : null;
        return {
          status,
          mensaje: cuerpo?.mensaje ?? MENSAJE_PARAMETROS,
          codigo,
          accion: 'ninguna',
          segundos: null,
        };
      }
      case 401:
        return {
          status,
          mensaje: MENSAJE_SESION,
          codigo,
          accion: 'iniciar-sesion',
          segundos: null,
        };
      case 403:
        return {
          status,
          mensaje: MENSAJE_PERMISO,
          codigo,
          accion: 'ninguna',
          segundos: null,
        };
      case 429: {
        // The backend says how long to wait; adopt its number instead of a guess.
        const segundos = this.segundosDeEspera(error);
        return {
          status,
          mensaje:
            segundos === null
              ? MENSAJE_LIMITE
              : `Hiciste demasiadas consultas. Espera ${segundos} segundos.`,
          codigo,
          accion: 'reintentar',
          segundos,
        };
      }
      case 503:
        return {
          status,
          mensaje: MENSAJE_SERVICIO,
          codigo,
          accion: 'reintentar',
          segundos: null,
        };
      default:
        return {
          status,
          mensaje: status === 0 ? MENSAJE_CONEXION : MENSAJE_SERVICIO,
          codigo,
          accion: 'reintentar',
          segundos: null,
        };
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

  /** Applies the search the wait held back, if there was one. */
  private liberarDiferida(): void {
    const termino = this.busquedaDiferida;
    if (termino === null) {
      return;
    }

    this.busquedaDiferida = null;
    if (validarBusqueda(termino) === null) {
      this.aplicarBusqueda(termino);
    }
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
    this.busquedaDiferida = null;
  }

  /** Reads `?pagina=` defensively: anything but a positive integer is page 1. */
  private paginaDeUrl(valor: string | null): number {
    if (valor === null) {
      return 1;
    }
    const pagina = Number(valor);
    return Number.isInteger(pagina) && pagina >= 1 ? pagina : 1;
  }

  /** Reacts to the browser's back/forward and to programmatic URL changes. */
  private alCambiarUrl(valor: string | null): void {
    const pagina = this.paginaDeUrl(valor);

    if (pagina === this.store.pagina()) {
      this.paginaEnUrl = pagina;
      return;
    }

    if (this.espera() > 0) {
      // Navigation stays frozen during a 429 wait, so a history move must not
      // leave the URL naming a page the screen cannot fetch yet.
      this.paginaEnUrl = this.store.pagina();
      void this.sincronizarUrl(this.paginaEnUrl, true);
      return;
    }

    this.paginaEnUrl = pagina;
    this.errorPagina.set(null);
    this.store.irAPagina(pagina);
  }

  /**
   * Writes the page into `?pagina=`. Page 1 removes the param entirely, so the
   * canonical URL of the screen stays clean.
   */
  private sincronizarUrl(pagina: number, reemplazar: boolean): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { pagina: pagina === 1 ? null : pagina },
      queryParamsHandling: 'merge',
      replaceUrl: reemplazar,
    });
  }
}
