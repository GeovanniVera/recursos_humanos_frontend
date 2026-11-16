import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { puedeEditarEmpleado } from '../../core/auth/editar-empleado.guard';
import { AuthService } from '../../core/auth/auth.service';
import { EmpleadoRegistrado } from '../../core/empleados/alta.models';
import { EmpleadosBufferStore } from '../../core/empleados/empleados-buffer.store';
import { FichaEmpleado } from '../../core/empleados/ficha.models';
import { ESTATUS_INICIAL, ETIQUETA_ESTATUS, SUBTITULO_ESTATUS, TITULO_ESTATUS } from '../../core/empleados/estatus-ui';
import { EmpleadoListadoError, FiltroEstatus } from '../../core/empleados/listado.models';
import { validarBusqueda } from '../../core/padron/validacion-busqueda';
import { AlertBanner } from '../../shared/ui/alert-banner/alert-banner.component';
import { Button } from '../../shared/ui/button/button.component';
import {
  DataTable,
  TableColumn,
  TableDensity,
  TableRow,
} from '../../shared/ui/data-table/data-table.component';
import { Pagination } from '../../shared/ui/pagination/pagination.component';
import { RowFlag, RowFlagTone } from '../../shared/ui/row-flag/row-flag.component';
import { RowLink } from '../../shared/ui/row-link/row-link.component';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { AltaDrawer } from './alta-drawer/alta-drawer.component';
import { EditarDrawer } from './editar-drawer/editar-drawer.component';
import { FichaDrawer } from './ficha-drawer/ficha-drawer.component';

/**
 * Own copy of the screen. Each failure below is a different situation for the
 * user, so each one gets its own sentence and its own action; a single
 * "something went wrong" would throw away that distinction.
 */
const MENSAJE_SESION = 'Tu sesión venció. Vuelve a iniciar sesión.';
const MENSAJE_PERMISO = 'No tienes permisos para consultar el listado de empleados.';
const MENSAJE_PERMISO_BUSQUEDA =
  'No tienes permisos para buscar en el listado: la búsqueda exige el caso E-12.';
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
 * `dd/mm/aaaa`, formatted in UTC.
 *
 * The API sends a calendar day (`YYYY-MM-DD`) and it is parsed at UTC midnight;
 * formatting it in a local zone west of UTC would print the previous day.
 */
const FORMATO_FECHA = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Tone each status paints, as the suffix of the stamp class.
 *
 * `baja` is the tone the ink already knows for a closed relationship; a leave
 * has its own, because a licence is not a termination.
 */
const TONO_ESTATUS: Readonly<Record<Exclude<FiltroEstatus, 'todos'>, string>> = {
  activo: 'activo',
  licencia: 'licencia',
  baja_definitiva: 'baja',
};

/**
 * What the alert offers the user.
 * - `reintentar`: another request may succeed (server, network or throttle).
 * - `iniciar-sesion`: the token is gone, retrying is pointless.
 * - `ninguna`: the answer is final until the user changes the criteria.
 */
type ListadoErrorAction = 'reintentar' | 'iniciar-sesion' | 'ninguna';

/** Failure of the listing, already translated into copy and into an action. */
interface FallaListado {
  /** HTTP status, or `0` when the request never reached the server. */
  status: number;
  /** Sentence the user reads. */
  mensaje: string;
  /** Contract code from the body (`permiso_denegado`, …), when there is one. */
  codigo: string | null;
  accion: ListadoErrorAction;
  /** Seconds the API asked to wait after a `429`; `null` when it sent no number. */
  segundos: number | null;
}

/** A tab of the listing's state strip. */
interface FiltroEstado {
  id: FiltroEstatus;
  label: string;
}

/**
 * Employees of the institution, reachable at `/empleados`.
 *
 * Paging has two levels. The user sees 20 rows at a time; the store asks the
 * backend for 100 records per request and serves five logical pages out of that
 * block. Moving inside the window is a local slice and sends no request; the
 * sixth page fetches the next block once.
 *
 * The screen owns the controls and the presentation. The list, the cache, the
 * page/block math, the status filter and the cancellation live in
 * `EmpleadosBufferStore`, so this component only maps rows, errors and counts to
 * the design system.
 *
 * The page lives in `?pagina=` so a deep link and the browser's back button
 * work. The search term deliberately does not: the backend avoids writing it
 * in its audit log, and putting it in the URL would write it into the browser
 * history instead.
 */
@Component({
  selector: 'app-empleados-page',
  imports: [
    AlertBanner,
    AltaDrawer,
    Button,
    DataTable,
    EditarDrawer,
    FichaDrawer,
    Pagination,
    RowFlag,
    RowLink,
  ],
  templateUrl: './empleados-page.component.html',
  styleUrl: './empleados-page.component.scss',
  // One buffer per visit: filter, page and cached blocks are not shared with a
  // second tab or with a later visit to the screen.
  providers: [EmpleadosBufferStore],
})
export class EmpleadosPage {
  private readonly store = inject(EmpleadosBufferStore);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  readonly puedeEditar = computed(() => puedeEditarEmpleado(this.auth.rol()));

  /**
   * Opens the edit folder on the row's worker.
   *
   * Temporary wiring for review: the pencil of the record used to navigate to
   * `/empleados/:id/editar`, and that route still exists. The third drawer takes
   * the id and emits, so this screen only has to say which worker it is about.
   */
  editarEmpleado(id: number): void {
    this.fichaAbierta.set(false);
    this.editarId.set(id);
    this.edicionAbierta.set(true);
  }

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

  /**
   * Room a row gets, chosen by the segmented control of the sheet's foot.
   *
   * Presentation only: the rows on screen are the page already served, so this
   * never re-queries and never resets the page.
   */
  readonly densidad = signal<TableDensity>('standard');

  /** The three settings the control offers, in the order the strip shows them. */
  readonly densidades: readonly { id: TableDensity; label: string }[] = [
    { id: 'compact', label: 'Compacta' },
    { id: 'standard', label: 'Estándar' },
    { id: 'comfortable', label: 'Amplia' },
  ];

  /**
   * The four state tabs, in the order the strip shows them.
   *
   * All four are operable: `GET /api/empleados` filters on `estatus` in SQL and
   * counts the filtered set, so the range line and the pager always describe the
   * list on screen. The counts of the strip stay empty on purpose — the
   * endpoint returns the total of the filter, not one figure per status, and a
   * number derived from another filter would be a lie.
   */
  readonly filtrosEstado: readonly FiltroEstado[] = [
    { id: 'todos', label: 'Todos' },
    { id: 'activo', label: 'Activos' },
    { id: 'baja_definitiva', label: 'Bajas definitivas' },
    { id: 'licencia', label: 'Licencias' },
  ];

  /**
   * Filter the strip has pressed.
   *
   * It starts on `activo` because this screen lives at `/empleados`: the
   * route names the default view, and the other three are a press away. The
   * value is mirrored into `?estatus=` so a deep link opens the same tab and the
   * breadcrumb can name it.
   */
  readonly estadoFiltro = signal<FiltroEstatus>(ESTATUS_INICIAL);

  /** Heading of the sheet, which follows the filter. */
  readonly titulo = computed(() => TITULO_ESTATUS[this.estadoFiltro()]);

  /** One sentence that says what the current filter is showing. */
  readonly subtitulo = computed(() => SUBTITULO_ESTATUS[this.estadoFiltro()]);

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

  /** Whether the registration folder is open. Two-way bound to it. */
  readonly altaAbierta = signal(false);

  /**
   * Internal key of the worker whose edit folder is open, or `null`.
   *
   * The folder is mounted once and gains its id from the pencil of the record:
   * one panel for the whole screen, the same way the record itself is mounted.
   */
  readonly editarId = signal<number | null>(null);

  /** Whether the edit folder is open. Two-way bound to it. */
  readonly edicionAbierta = signal(false);

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
  readonly falla = computed<FallaListado | null>(() => this.describirError(this.store.error()));

  /**
   * Columns of the listing, in the order the canvas lists them.
   *
   * The status is its own column now that the listing holds three of them: the
   * number used to carry the stamp inside it, which pushed the figure and left
   * the rest of the row empty. The date joins only when the list can hold a
   * terminated worker — on `activo` it would be a column of dashes.
   */
  readonly columnas = computed<readonly TableColumn[]>(() => {
    const columnas: TableColumn[] = [
      { key: 'num_empleado', header: 'Núm. empleado', align: 'end', width: '11rem' },
      { key: 'nombre', header: 'Nombre' },
      { key: 'area', header: 'Área' },
      { key: 'estatus', header: 'Estado', width: '14rem' },
    ];

    if (this.estadoFiltro() !== 'activo') {
      columnas.push({ key: 'fecha_baja', header: 'Fecha de baja', width: '11rem' });
    }

    return columnas;
  });

  /**
   * Rows of the table, flattened to the printable fields.
   *
   * The table takes plain records on purpose, so the domain shape stops here:
   * an employee with no area arrives as `null` and leaves as the placeholder the
   * column shows.
   */
  readonly filas = computed<readonly TableRow[]>(() =>
    this.store.filas().map((empleado) => ({
      id: empleado.id,
      num_empleado: empleado.num_empleado,
      nombre: empleado.nombre,
      area: empleado.area?.nombre ?? SIN_DATO,
      estatus: empleado.estatus,
      fecha_baja: empleado.fecha_baja,
    })),
  );

  /**
   * Tone of the lane and of the stamp of a row.
   *
   * The table hands rows as plain records, so the value is narrowed here instead
   * of in the template: an unknown status falls back to the terminated tone,
   * which is the state that asks for the most care.
   */
  tonoDe(fila: TableRow): RowFlagTone {
    const estatus = fila['estatus'];
    return estatus === 'licencia' ? 'licencia' : estatus === 'activo' ? 'activo' : 'baja';
  }

  /** Word the stamp of a row prints for its status. */
  etiquetaDe(fila: TableRow): string {
    const estatus = fila['estatus'];
    return estatus === 'licencia'
      ? ETIQUETA_ESTATUS.licencia
      : estatus === 'activo'
        ? ETIQUETA_ESTATUS.activo
        : ETIQUETA_ESTATUS.baja_definitiva;
  }

  /**
   * Sentence the lane announces for assistive tech.
   *
   * The lane is decoration; this is what a screen reader hears at the start of
   * the row. The stamp in `Estado` stays out of the accessibility tree so the
   * same datum is not read twice, exactly like the traffic light.
   */
  descripcionDe(fila: TableRow): string {
    const estatus = fila['estatus'];
    if (estatus === 'baja_definitiva' && typeof fila['fecha_baja'] === 'string') {
      return `Estado: baja definitiva, desde ${fila['fecha_baja']}`;
    }
    return `Estado: ${this.etiquetaDe(fila).toLowerCase()}`;
  }

  /**
   * Calendar day of the termination, as the cell prints it.
   *
   * `timeZone: 'UTC'` is not decoration: the API sends a calendar day and the
   * date is parsed at UTC midnight, so formatting it in a local zone west of UTC
   * would print the day before. An active worker has no date, and the cell says
   * so with the same placeholder the rest of the table uses.
   */
  fechaDe(fila: TableRow): string {
    const valor = fila['fecha_baja'];
    if (typeof valor !== 'string' || valor.trim() === '') {
      return SIN_DATO;
    }

    const fecha = new Date(`${valor.trim()}T00:00:00Z`);
    return Number.isNaN(fecha.getTime()) ? valor.trim() : FORMATO_FECHA.format(fecha);
  }

  /**
   * Figure the strip prints per tab, already flattened by status.
   *
   * The endpoint counts the universe the search narrowed, without the status
   * filter, so all four figures describe the same list the sheet is paging. A
   * missing answer reads as `0` here and the caller decides whether to print a
   * placeholder instead of a figure.
   */
  private readonly figurasPorEstatus = computed<Readonly<Record<FiltroEstatus, number>>>(() => {
    const contadores = this.store.contadores();
    return {
      todos: contadores?.total ?? 0,
      activo: contadores?.activo ?? 0,
      licencia: contadores?.licencia ?? 0,
      baja_definitiva: contadores?.baja_definitiva ?? 0,
    };
  });

  /** Figure the tab prints, or the placeholder while the first answer travels. */
  contadorDe(filtro: FiltroEstado): string {
    if (this.store.contadores() === null) {
      return SIN_DATO;
    }
    return this.formato.format(this.figurasPorEstatus()[filtro.id]);
  }

  /** Accessible name of the tab: the label the eye reads plus the figure. */
  etiquetaTab(filtro: FiltroEstado): string {
    if (this.store.contadores() === null) {
      return `${filtro.label}: contando…`;
    }

    const total = this.figurasPorEstatus()[filtro.id];
    return `${filtro.label}: ${this.formato.format(total)} ${total === 1 ? 'empleado' : 'empleados'}`;
  }

  /** Emptiness has three causes, and the message has to name the right one. */
  readonly mensajeVacio = computed(() => {
    if (this.falla() !== null && !this.hayDatos()) {
      return 'No se pudo cargar el listado.';
    }

    if (this.store.buscar().trim().length > 0) {
      return 'No hay empleados que coincidan con la búsqueda.';
    }

    switch (this.estadoFiltro()) {
      case 'todos':
        return 'Todavía no hay empleados registrados.';
      case 'licencia':
        return 'No hay empleados en licencia.';
      case 'baja_definitiva':
        return 'No hay empleados con baja definitiva.';
      default:
        return 'Todavía no hay empleados activos.';
    }
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
    const estatusUrl = this.route.snapshot.queryParamMap.get('estatus');
    const paginaInicial = this.paginaDeUrl(paginaUrl);
    const estatusInicial = this.estatusDeUrl(estatusUrl);

    this.paginaEnUrl = paginaInicial;
    this.estadoFiltro.set(estatusInicial);
    this.store.iniciar(paginaInicial, estatusInicial);

    // Normalize a value the URL invented (`pagina=abc`, `estatus=otro`). A valid
    // one is left untouched so opening the screen does not add a history entry.
    const paginaInvalida = paginaUrl !== null && String(paginaInicial) !== paginaUrl;
    const estatusInvalido = estatusUrl !== null && estatusInicial !== estatusUrl;

    if (paginaInvalida || estatusInvalido) {
      void this.sincronizarUrl(paginaInicial, estatusInicial, true);
    }

    this.terminos
      .pipe(debounceTime(RETRASO_BUSQUEDA), takeUntilDestroyed(this.destroyRef))
      .subscribe((termino) => this.aplicarTermino(termino));

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => this.alCambiarUrl(params));

    // A page change that came from the buffer (cache hit or a new block) has to
    // reach the URL. The guard keeps the query subscription from echoing it.
    effect(() => {
      const pagina = this.store.pagina();
      if (pagina === this.paginaEnUrl) {
        return;
      }
      this.paginaEnUrl = pagina;
      void this.sincronizarUrl(pagina, this.estadoFiltro(), false);
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
        void this.sincronizarUrl(visible, this.estadoFiltro(), true);
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
   * Changes how much room a row gets.
   *
   * Density is presentation of the same page of the same cached block, so this
   * is a repaint and not a query: no block is dropped and no page resets.
   */
  cambiarDensidad(densidad: TableDensity): void {
    this.densidad.set(densidad);
  }

  /**
   * Presses a state filter of the strip.
   *
   * The filter lands on the server, never on the rows already loaded: this
   * screen pages against a buffered list, so filtering or counting what is on
   * screen would make the range line and the pager lie about the rest. The store
   * treats the status as part of the request identity, so a new one drops the
   * cached blocks and starts at the first page.
   *
   * The tab is written into `?estatus=` for two reasons: a deep link reopens the
   * same list, and the breadcrumb — which reads the URL, not this component —
   * can name the tab that is actually on screen.
   */
  filtrarEstado(filtro: FiltroEstado): void {
    if (this.espera() > 0 || filtro.id === this.estadoFiltro()) {
      return;
    }

    this.errorPagina.set(null);
    this.estadoFiltro.set(filtro.id);
    // The new result set starts at the first page; recording it here keeps the
    // page effect from firing a second navigation for the same move.
    this.paginaEnUrl = 1;
    this.store.aplicarFiltro(filtro.id);
    void this.sincronizarUrl(1, filtro.id, false);
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
   * Asks for the listing again after an act of the lifecycle.
   *
   * The row the drawer acted on may have changed status. If the new status no
   * longer matches the filter on screen the backend drops it from this list; if
   * it still matches, the row comes back updated. Either way the answer is the
   * server's, so the block is read again while the current rows stay put.
   */
  alActualizarCicloVida(): void {
    this.errorPagina.set(null);
    this.store.recargar();
  }

  /** Opens the folder where a new file is written, over the roster it feeds. */
  abrirAlta(): void {
    this.altaAbierta.set(true);
  }

  /**
   * A new employee just landed.
   *
   * The drawer says the act happened and nothing else: the toast names the
   * number the system assigned, which is the one datum the operator needs, and
   * the roster asks again because the new row belongs to this list — it is the
   * first page of it when the order is by number.
   */
  alRegistrarEmpleado(empleado: EmpleadoRegistrado): void {
    this.toast.show({
      type: 'success',
      title: 'Empleado registrado.',
      message: `Número de empleado ${empleado.num_empleado}.`,
    });

    this.errorPagina.set(null);
    this.store.recargar();
  }

  /**
   * An edit just landed.
   *
   * The drawer says the act happened and closes; the toast names the worker and
   * the roster asks again, because the row of this screen prints the name and the
   * area the edit may have changed.
   */
  alActualizarEmpleado(empleado: FichaEmpleado): void {
    this.toast.show({
      type: 'success',
      title: 'Empleado actualizado correctamente.',
      message: `Número de empleado ${empleado.identificacion.num_empleado}.`,
    });

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
  private describirError(error: unknown): FallaListado | null {
    if (error === null) {
      return null;
    }

    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const codigo = this.codigoDe(error);

    switch (status) {
      case 401:
        return {
          status,
          mensaje: MENSAJE_SESION,
          codigo,
          accion: 'iniciar-sesion',
          segundos: null,
        };
      case 403: {
        // The capability layer does not destroy the token, so this is "no
        // permission", not "session over". A denied search is a different
        // capability (E-12) than a denied listing (E-01), and the message says
        // which one the user can ask for.
        const buscando = this.store.buscar().trim().length > 0;
        return {
          status,
          mensaje: buscando ? MENSAJE_PERMISO_BUSQUEDA : MENSAJE_PERMISO,
          codigo,
          accion: 'ninguna',
          segundos: null,
        };
      }
      case 422: {
        // Laravel's default envelope: a general sentence plus the messages of
        // each field. The first one names the offending parameter, which is what
        // the operator needs to correct.
        const cuerpo =
          error instanceof HttpErrorResponse ? (error.error as EmpleadoListadoError | null) : null;
        const primero = cuerpo?.errors === undefined
          ? undefined
          : Object.values(cuerpo.errors)[0]?.[0];

        return {
          status,
          mensaje: primero ?? cuerpo?.message ?? MENSAJE_PARAMETROS,
          codigo,
          accion: 'ninguna',
          segundos: null,
        };
      }
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
    const cuerpo = error.error as EmpleadoListadoError | null;
    return typeof cuerpo?.codigo === 'string' ? cuerpo.codigo : null;
  }

  /** Reads the wait out of a `429` body, or `null` when it carries no number. */
  private segundosDeEspera(error: unknown): number | null {
    if (!(error instanceof HttpErrorResponse)) {
      return null;
    }
    const cuerpo = error.error as EmpleadoListadoError | null;
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

  /**
   * Reads `?estatus=` defensively: anything outside the contract is the default.
   *
   * An unknown value is not a state, and letting it through would ask the server
   * for a 422 the screen could have avoided.
   */
  private estatusDeUrl(valor: string | null): FiltroEstatus {
    return valor === 'todos' || valor === 'licencia' || valor === 'baja_definitiva'
      ? valor
      : ESTATUS_INICIAL;
  }

  /** Reacts to the browser's back/forward and to programmatic URL changes. */
  private alCambiarUrl(params: ParamMap): void {
    if (this.espera() > 0) {
      // Navigation stays frozen during a 429 wait, so a history move must not
      // leave the URL naming a list the screen cannot fetch yet.
      this.paginaEnUrl = this.store.pagina();
      void this.sincronizarUrl(this.paginaEnUrl, this.estadoFiltro(), true);
      return;
    }

    const estatus = this.estatusDeUrl(params.get('estatus'));

    if (estatus !== this.estadoFiltro()) {
      this.errorPagina.set(null);
      this.estadoFiltro.set(estatus);
      this.store.aplicarFiltro(estatus);
    }

    const pagina = this.paginaDeUrl(params.get('pagina'));

    if (pagina === this.store.pagina()) {
      this.paginaEnUrl = pagina;
      return;
    }

    this.paginaEnUrl = pagina;
    this.errorPagina.set(null);
    this.store.irAPagina(pagina);
  }

  /**
   * Writes the page and the status into the URL.
   *
   * Both defaults are removed rather than serialised: page 1 and the `activo`
   * tab are what the bare `/empleados` already means, so the canonical
   * address of the screen stays clean.
   */
  private sincronizarUrl(
    pagina: number,
    estatus: FiltroEstatus,
    reemplazar: boolean,
  ): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        pagina: pagina === 1 ? null : pagina,
        estatus: estatus === ESTATUS_INICIAL ? null : estatus,
      },
      queryParamsHandling: 'merge',
      replaceUrl: reemplazar,
    });
  }
}
