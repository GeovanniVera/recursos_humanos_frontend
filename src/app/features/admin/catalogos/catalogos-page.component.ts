import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Observable, Subject, catchError, debounceTime, finalize, forkJoin, map, of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { flattenAreaTree } from '../../../core/catalogos/area-tree';
import {
  AreaCatalogo,
  CatalogoDiagnostico,
  CategoriaCatalogo,
  EditarPuestoRequest,
  ErrorDominio,
  PuestoArea,
  PuestoCatalogo,
  PuestoCategoria,
  PuestosFiltros,
} from '../../../core/catalogos/catalogos.models';
import { CatalogosService } from '../../../core/catalogos/catalogos.service';
import { Button } from '../../../shared/ui/button/button.component';
import {
  DataTable,
  TableColumn,
  TableRow,
} from '../../../shared/ui/data-table/data-table.component';
import { Modal } from '../../../shared/ui/modal/modal.component';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import {
  DiagnosticoBanner,
  HallazgoPuesto,
} from './diagnostico-banner/diagnostico-banner.component';

/**
 * Own copy of the screen. Each failure below is a different situation for the
 * user, so each one gets its own sentence; a single "something went wrong"
 * would throw that distinction away.
 */
const MENSAJE_SESION = 'Tu sesión venció. Volvé a iniciar sesión.';
const MENSAJE_PERMISO = 'No tenés permiso para administrar los catálogos.';
const MENSAJE_SERVICIO = 'El servicio no está disponible. Reintentá en unos segundos.';
const MENSAJE_CONEXION = 'No pudimos conectar con el servidor. Revisá tu conexión.';

/**
 * Domain codes of this API, translated. The backend sentence is specific but
 * written for a log; these are what the operator has to read.
 *
 * It describes something the backend refused, not something it gave up on: the
 * row did not change, so the control goes back and nothing is refreshed.
 */
const MENSAJE_PUESTO_EN_USO =
  'Ese puesto tiene empleados activos: no se puede cambiar de categoría ni quitarle un área.';
/** Last resort for a `409` with a code this screen does not know. */
const MENSAJE_CONFLICTO = 'El servidor rechazó el cambio: el dato sigue en uso.';
/** A `422` with no per-field message to show. */
const MENSAJE_INVALIDO = 'El servidor rechazó los datos enviados.';

/** Silence that turns typing into a filter. Nothing is requested, only filtered. */
const RETRASO_BUSQUEDA = 300;

/** Rows per page. The endpoint returns the whole list, so paging is local. */
const POR_PAGINA = 20;

/** Value of the area filter that asks the server for the posts with no area. */
const SIN_AREA = 'sin-area';

/** Tabs of the screen, in the order the ARIA tablist declares them. */
const TABS = ['puestos', 'categorias', 'areas'] as const;

/** The three catalogs and the finder, each with a label on screen. */
const ETIQUETAS_TAB: Readonly<Record<TabCatalogos, string>> = {
  puestos: 'Puestos',
  categorias: 'Categorías',
  areas: 'Áreas',
};

type TabCatalogos = (typeof TABS)[number];

/**
 * Narrowings of the post table the client resolves itself.
 *
 * "Sin área" and "sin empleados" are not here: the row does not carry what they
 * need, so the backend answers them and they travel as query params.
 */
type Hallazgo = 'todos' | 'contradiccion';

/** Narrowing of the post table that still needs a request, for the chip. */
type AvisoFiltro = 'sin-empleados' | 'contradiccion';

/** Copy of each chip that tells which diagnostic is narrowing the table. */
const LEYENDAS_AVISO: Readonly<Record<AvisoFiltro, string>> = {
  'sin-empleados': 'Mostrando los puestos sin empleados',
  contradiccion: 'Mostrando las clasificaciones en contra',
};

/** State filter of the post table. */
type EstadoFiltro = 'todos' | 'activos' | 'inactivos';

/**
 * What the failure block offers.
 * - `reintentar`: another request may succeed.
 * - `iniciar-sesion`: the token is gone, retrying is pointless.
 * - `ninguna`: a permission answer will not change by asking again.
 */
type AccionError = 'reintentar' | 'iniciar-sesion' | 'ninguna';

/** A read failure, already translated into copy and into an action. */
interface FallaCatalogos {
  status: number;
  mensaje: string;
  codigo: string | null;
  accion: AccionError;
}

/** Area flattened with the indent of its depth, ready for a `<select>`. */
interface AreaOpcion {
  readonly id: number;
  readonly nombre: string;
  /** Non-breaking spaces that express the depth of the node in the chart. */
  readonly sangria: string;
}

/**
 * Administration of the catalogs that feed the registration form and the
 * employee record: posts, CCT categories and the organization chart.
 *
 * The three endpoints that list a catalog answer with the **whole** list, so
 * every page and every counter of this screen is computed on the client. The
 * three post filters are the exception: `sin_area`, `sin_empleados` and `activo`
 * are query params, because "how many employees hold this post" is not a field
 * of the row and the screen could not answer it from what it has. A filter
 * change is therefore one `GET`, and the answer replaces the snapshot.
 *
 * What stays local is what the rows still support: the free-text search, the
 * filter by one concrete area (the contract has no `area_id` param, so it is
 * never sent) and the contradicted-classification narrowing, which comes from
 * the diagnostics.
 *
 * The catalogs themselves are read-only: nothing is created, renamed or
 * deactivated here. What this screen writes is the association between a post
 * and an area — added from the selection bar, removed from the row — and the
 * category a post declares. That category edit is optimistic: the row shows the
 * new value at once, the row locks while the request is in flight, and a refusal
 * puts the previous value back and raises a toast. Writing optimistically is not
 * decoration — a `<select>` the user already moved cannot be "reverted" unless
 * the model moves with it and then moves back.
 */
@Component({
  selector: 'app-catalogos-page',
  imports: [Button, DataTable, DiagnosticoBanner, Modal],
  templateUrl: './catalogos-page.component.html',
  styleUrl: './catalogos-page.component.scss',
})
export class CatalogosPage {
  private readonly catalogosService = inject(CatalogosService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Tab on screen. The panels are rendered one at a time. */
  readonly tab = signal<TabCatalogos>('puestos');

  /** Labels of the tabs, in order. */
  readonly tabs = TABS;

  /** Snapshot of `GET /catalogos/puestos`, or `null` before the first answer. */
  readonly puestos = signal<readonly PuestoCatalogo[] | null>(null);

  /** Snapshot of `GET /catalogos/categorias`. */
  readonly categorias = signal<readonly CategoriaCatalogo[] | null>(null);

  /** Snapshot of `GET /catalogos/areas`, still flat and unordered. */
  readonly areas = signal<readonly AreaCatalogo[] | null>(null);

  /** Snapshot of `GET /catalogos/diagnostico`. */
  readonly diagnostico = signal<CatalogoDiagnostico | null>(null);

  /** `true` while the four reads of the snapshot are in flight. */
  readonly cargando = signal(true);

  /** `true` while a post list narrowed by a filter is being fetched. */
  readonly recargando = signal(false);

  /** Last read failure, or `null`. */
  readonly error = signal<FallaCatalogos | null>(null);

  /** Term of the search field, as typed. */
  readonly buscar = signal('');

  /** Term the table is filtered by: the typed one, once the silence is over. */
  readonly termino = signal('');

  /** Area filter: `''` for all, `SIN_AREA` for the posts with none, or an id. */
  readonly filtroArea = signal('');

  /** State filter of the post table, sent as `activo=1|0`. */
  readonly estado = signal<EstadoFiltro>('todos');

  /** `true` when the table shows only the posts nobody holds (`sin_empleados=1`). */
  readonly sinEmpleados = signal(false);

  /** Diagnostic the table is narrowed to, or `todos`. */
  readonly hallazgo = signal<Hallazgo>('todos');

  /** Page of the post table, 1-based. */
  readonly pagina = signal(1);

  /** `id`s of the posts the operator selected, across pages. */
  readonly seleccion = signal<ReadonlySet<number>>(new Set());

  /** Rows with a request in flight, keyed by `puesto-7`. */
  private readonly guardando = signal<ReadonlySet<string>>(new Set());

  /** `true` while a modal is submitting. */
  readonly enviando = signal(false);

  /** Whether the assign modal is open. */
  readonly modalAsignar = signal(false);

  /** Area chosen in the assign modal. */
  readonly areaDestino = signal<number | null>(null);

  /** One formatter for every count, so all figures group digits alike. */
  private readonly formato = new Intl.NumberFormat('es-MX');

  /** Terms typed into the search field, before the silence that applies them. */
  private readonly terminos = new Subject<string>();

  /**
   * Columns of the post table.
   *
   * There is no usage count — the row does not carry one — and no action column:
   * the two writes of a row live in the cells themselves.
   */
  readonly columnasPuestos: readonly TableColumn[] = [
    { key: 'seleccion', header: 'Selección' },
    { key: 'nombre', header: 'Nombre' },
    { key: 'categoria', header: 'Categoría' },
    { key: 'areas', header: 'Áreas' },
    { key: 'activo', header: 'Activo' },
  ];

  /** Columns of the category table. Read-only: the catalog is not editable. */
  readonly columnasCategorias: readonly TableColumn[] = [
    { key: 'clave', header: 'Clave' },
    { key: 'tipo', header: 'Tipo' },
    { key: 'descripcion', header: 'Descripción' },
    { key: 'activo', header: 'Activo' },
  ];

  /** Columns of the chart table. Read-only: the catalog is not editable. */
  readonly columnasAreas: readonly TableColumn[] = [
    { key: 'nombre', header: 'Adscripción' },
    { key: 'asignable', header: 'Asignable' },
    { key: 'activo', header: 'Activo' },
  ];

  /** The chart flattened with the indent of each node. */
  private readonly areasPlanas = computed(() => flattenAreaTree(this.areas() ?? []));

  /** Options of every area selector: the filter, the assign modal. */
  readonly opcionesArea = computed<readonly AreaOpcion[]>(() =>
    this.areasPlanas().map(({ area, depth }) => ({
      id: area.id,
      nombre: area.nombre,
      sangria: '\u00A0\u00A0'.repeat(depth),
    })),
  );

  /** Categories a post can be moved to. A deactivated one is not offered. */
  readonly categoriasActivas = computed<readonly CategoriaCatalogo[]>(() =>
    (this.categorias() ?? []).filter((categoria) => categoria.activo),
  );

  /** `true` when at least one filter of the post table needs the backend to answer. */
  private readonly hayFiltroServidor = computed(
    () => this.filtroArea() === SIN_AREA || this.sinEmpleados() || this.estado() !== 'todos',
  );

  /**
   * Posts of the snapshot after the local narrowings, in the order the endpoint
   * sent them.
   */
  readonly puestosFiltrados = computed<readonly PuestoCatalogo[]>(() => {
    const lista = this.puestos() ?? [];
    const termino = this.termino().trim().toLowerCase();
    const area = this.filtroArea();
    const contradichos = new Set(
      (this.diagnostico()?.puestos_con_clasificacion_contradicha ?? []).map((fila) => fila.puesto),
    );

    return lista.filter((puesto) => {
      if (termino !== '' && !puesto.nombre.toLowerCase().includes(termino)) {
        return false;
      }
      // A concrete area is a local narrowing over the areas a post belongs to;
      // "sin área" is a server filter, and the answer already holds only those
      // rows.
      if (area !== '' && area !== SIN_AREA && !puesto.areas.some((a) => a.id === Number(area))) {
        return false;
      }
      if (this.hallazgo() === 'contradiccion' && !contradichos.has(puesto.nombre)) {
        return false;
      }
      return true;
    });
  });

  /** Pages the filtered list takes. An empty list still has one page. */
  readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.puestosFiltrados().length / POR_PAGINA)),
  );

  /** Page on screen, clamped to the end of the list after a filter shrinks it. */
  readonly paginaActual = computed(() => Math.min(this.pagina(), this.totalPaginas()));

  /** Posts of the page on screen. */
  private readonly puestosPagina = computed<readonly PuestoCatalogo[]>(() => {
    const desde = (this.paginaActual() - 1) * POR_PAGINA;
    return this.puestosFiltrados().slice(desde, desde + POR_PAGINA);
  });

  /**
   * Rows of the post table, flattened to plain records.
   *
   * `categoria` and `areas` are the text a cell prints when nothing replaces it;
   * `categoria_id` is not a column — it is what the category selector compares
   * against to know which option is the stored one.
   */
  readonly filasPuestos = computed<readonly TableRow[]>(() =>
    this.puestosPagina().map((puesto) => ({
      id: puesto.id,
      nombre: puesto.nombre,
      categoria:
        puesto.categoria === null ? 'Sin categoría' : this.etiquetaCategoria(puesto.categoria),
      categoria_id: puesto.categoria?.id ?? null,
      areas: this.etiquetaAreas(puesto.areas),
      activo: this.siNo(puesto.activo),
    })),
  );

  /** Rows of the category table. */
  readonly filasCategorias = computed<readonly TableRow[]>(() =>
    (this.categorias() ?? []).map((categoria) => ({
      id: categoria.id,
      clave: categoria.clave,
      tipo: categoria.tipo,
      descripcion: categoria.descripcion ?? '',
      activo: this.siNo(categoria.activo),
    })),
  );

  /** Rows of the chart table, in traversal order, each with its depth. */
  readonly filasAreas = computed<readonly TableRow[]>(() =>
    this.areasPlanas().map(({ area, depth }) => ({
      id: area.id,
      nombre: area.nombre,
      depth,
      asignable: this.siNo(area.asignable),
      activo: this.siNo(area.activo),
    })),
  );

  /** `true` while any of the three tables is waiting for rows. */
  readonly cargandoTabla = computed(() => this.cargando() || this.recargando());

  /** `Mostrando 1–20 de 156`. */
  readonly rangoPuestos = computed(() => {
    const total = this.puestosFiltrados().length;
    if (total === 0) {
      return 'Sin puestos';
    }

    const desde = (this.paginaActual() - 1) * POR_PAGINA + 1;
    const hasta = Math.min(this.paginaActual() * POR_PAGINA, total);
    return `Mostrando ${this.formato.format(desde)}–${this.formato.format(hasta)} de ${this.formato.format(total)}`;
  });

  /** `1 / 8`, the counter the pager prints between its two arrows. */
  readonly etiquetaPagina = computed(
    () =>
      `${this.formato.format(this.paginaActual())} / ${this.formato.format(this.totalPaginas())}`,
  );

  /** How many posts are selected. */
  readonly totalSeleccionados = computed(() => this.seleccion().size);

  /** `2 seleccionados`. */
  readonly etiquetaSeleccion = computed(() => {
    const total = this.totalSeleccionados();
    return `${this.formato.format(total)} ${total === 1 ? 'seleccionado' : 'seleccionados'}`;
  });

  /** `Asignar área a 2 puestos`. */
  readonly tituloAsignar = computed(() => {
    const total = this.totalSeleccionados();
    return `Asignar área a ${this.formato.format(total)} ${total === 1 ? 'puesto' : 'puestos'}`;
  });

  /** Names of the selected posts, in selection order. */
  readonly nombresSeleccionados = computed<readonly string[]>(() => {
    const ids = this.seleccion();
    return [...ids]
      .sort((a, b) => a - b)
      .map((id) => (this.puestos() ?? []).find((puesto) => puesto.id === id))
      .filter((puesto): puesto is PuestoCatalogo => puesto !== undefined)
      .map((puesto) => puesto.nombre);
  });

  /** `true` when every row of the page on screen is selected. */
  readonly paginaCompleta = computed(() => {
    const filas = this.puestosPagina();
    return filas.length > 0 && filas.every((puesto) => this.seleccion().has(puesto.id));
  });

  /** Chips of the diagnostic narrowings that are on, in a stable order. */
  readonly avisosActivos = computed<readonly AvisoFiltro[]>(() => {
    const avisos: AvisoFiltro[] = [];
    if (this.sinEmpleados()) {
      avisos.push('sin-empleados');
    }
    if (this.hallazgo() === 'contradiccion') {
      avisos.push('contradiccion');
    }
    return avisos;
  });

  /**
   * `true` when the failure leaves nothing to administer.
   *
   * A `403` is final: the tabs would be empty tables with no explanation, so
   * they leave with the alert.
   */
  readonly bloqueado = computed(() => this.error()?.accion === 'ninguna');

  /** Empty sentence of the post table, naming the right cause. */
  readonly mensajeVacioPuestos = computed(() => {
    const filtrado =
      this.termino().trim() !== '' ||
      this.filtroArea() !== '' ||
      this.estado() !== 'todos' ||
      this.sinEmpleados() ||
      this.hallazgo() !== 'todos';

    return filtrado
      ? 'No hay puestos que coincidan con el filtro.'
      : 'Todavía no hay puestos cargados.';
  });

  constructor() {
    this.terminos
      .pipe(debounceTime(RETRASO_BUSQUEDA), takeUntilDestroyed(this.destroyRef))
      .subscribe((termino) => {
        // A term that is no longer in the field is a stale keystroke: a filter
        // button may have cleared the field while the silence was running.
        if (termino === this.buscar()) {
          this.termino.set(termino);
        }
      });

    this.cargar();
  }

  // --- Reading ---------------------------------------------------------------

  /**
   * Reads the whole snapshot: three catalogs plus the diagnostics.
   *
   * The four reads are one unit on purpose. A partial answer would leave the
   * banner counting something the tables do not show, and every row needs the
   * area names and the categories before it can paint its selectors. A failure
   * therefore discards the batch and leaves the previous snapshot on screen.
   */
  cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.leer({
      puestos: this.catalogosService.puestos(this.filtrosPuestos()),
      categorias: this.catalogosService.categorias(),
      areas: this.catalogosService.areas(),
      diagnostico: this.catalogosService.diagnostico(),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.cargando.set(false)),
      )
      .subscribe((datos) => {
        if (datos === null) {
          return;
        }

        this.puestos.set(datos.puestos);
        this.categorias.set(datos.categorias);
        this.areas.set(datos.areas);
        this.diagnostico.set(datos.diagnostico);
        this.podarSeleccion(datos.puestos);
      });
  }

  // --- Filters ---------------------------------------------------------------

  /** Reads the field into state and restarts the table from the first page. */
  alBuscar(evento: Event): void {
    const termino = (evento.target as HTMLInputElement).value;
    this.buscar.set(termino);
    this.pagina.set(1);
    this.terminos.next(termino);
  }

  /**
   * Applies the area filter.
   *
   * `''` is "todas" and an id is a local narrowing, so neither asks the backend;
   * crossing into or out of "sin área" does, because those rows are the answer
   * of `sin_area=1` and cannot be reconstructed from a narrowed snapshot.
   */
  alFiltrarArea(evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;

    if (valor === this.filtroArea()) {
      return;
    }

    const pideSinArea = valor === SIN_AREA;
    const teniaSinArea = this.filtroArea() === SIN_AREA;

    this.filtroArea.set(valor);
    this.pagina.set(1);

    if (pideSinArea !== teniaSinArea) {
      this.recargarPuestos();
    }
  }

  /** Applies the state filter. It always travels: `activo` is a server param. */
  alFiltrarEstado(evento: Event): void {
    const estado = (evento.target as HTMLSelectElement).value as EstadoFiltro;

    if (estado === this.estado()) {
      return;
    }

    this.estado.set(estado);
    this.pagina.set(1);
    this.recargarPuestos();
  }

  /**
   * Narrows the table to one finding and switches to the tab that shows it.
   *
   * Every other filter is cleared first: the operator asked to see exactly what
   * the counter counts, and a leftover term would show fewer rows than the
   * banner promised. The two counters that need the backend ask it in the same
   * gesture, so one click is one request.
   */
  revisar(hallazgo: HallazgoPuesto): void {
    const resolviaElServidor = this.hayFiltroServidor();
    this.limpiarFiltros();

    if (hallazgo === 'sin-area') {
      this.filtroArea.set(SIN_AREA);
    } else if (hallazgo === 'sin-empleados') {
      this.sinEmpleados.set(true);
    } else {
      this.hallazgo.set('contradiccion');
    }

    this.tab.set('puestos');

    if (resolviaElServidor || this.hayFiltroServidor()) {
      this.recargarPuestos();
    }
  }

  /** Drops the `sin_empleados` narrowing, asking the backend for the full list. */
  limpiarSinEmpleados(): void {
    if (!this.sinEmpleados()) {
      return;
    }
    this.sinEmpleados.set(false);
    this.pagina.set(1);
    this.recargarPuestos();
  }

  /** Drops the diagnostic filter, keeping the controls as they are. */
  limpiarHallazgo(): void {
    this.hallazgo.set('todos');
    this.pagina.set(1);
  }

  /** Sends the table back to the first page after a filter changed the result set. */
  irA(destino: number): void {
    if (destino < 1 || destino > this.totalPaginas()) {
      return;
    }
    this.pagina.set(destino);
  }

  /** Switches tabs from the tablist. */
  irATab(tab: TabCatalogos): void {
    this.tab.set(tab);
  }

  /** Drops the local session and returns to the door. */
  iniciarSesion(): void {
    this.auth.limpiarSesionLocal();
    void this.router.navigate(['/login']);
  }

  /** Arrow / Home / End navigation of the tablist. */
  alNavegarTabs(evento: KeyboardEvent): void {
    const actual = TABS.indexOf(this.tab());
    let destino: number | null = null;

    switch (evento.key) {
      case 'ArrowRight':
        destino = (actual + 1) % TABS.length;
        break;
      case 'ArrowLeft':
        destino = (actual - 1 + TABS.length) % TABS.length;
        break;
      case 'Home':
        destino = 0;
        break;
      case 'End':
        destino = TABS.length - 1;
        break;
      default:
        return;
    }

    evento.preventDefault();
    this.tab.set(TABS[destino]);
  }

  // --- Selection -------------------------------------------------------------

  /** Selects or unselects one row. */
  alternarSeleccion(fila: TableRow): void {
    const id = this.idDe(fila);
    const siguiente = new Set(this.seleccion());

    if (siguiente.has(id)) {
      siguiente.delete(id);
    } else {
      siguiente.add(id);
    }

    this.seleccion.set(siguiente);
  }

  /** Header checkbox: selects or unselects every row of the page on screen. */
  alternarPagina(evento: Event): void {
    const seleccionar = (evento.target as HTMLInputElement).checked;
    const siguiente = new Set(this.seleccion());

    for (const puesto of this.puestosPagina()) {
      if (seleccionar) {
        siguiente.add(puesto.id);
      } else {
        siguiente.delete(puesto.id);
      }
    }

    this.seleccion.set(siguiente);
  }

  /** Empties the selection. */
  limpiarSeleccion(): void {
    this.seleccion.set(new Set());
  }

  // --- Modals ----------------------------------------------------------------

  /** Opens the assign modal with no area chosen. */
  abrirAsignar(): void {
    this.areaDestino.set(null);
    this.modalAsignar.set(true);
  }

  /** Closes the assign modal, whatever closed it. */
  alCambiarAsignar(abierto: boolean): void {
    this.modalAsignar.set(abierto);
    if (!abierto) {
      this.areaDestino.set(null);
    }
  }

  /** Writes the area of the assign modal. */
  alElegirAreaDestino(evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    this.areaDestino.set(valor === '' ? null : Number(valor));
  }

  // --- Writes ----------------------------------------------------------------

  /**
   * `POST /catalogos/puestos/asignar-area` with the selected posts.
   *
   * The call is idempotent, so a second attempt at the same pair is not an
   * error: `creados` says how many associations did not exist yet, and that is
   * what the success message reports.
   */
  asignar(): void {
    const areaId = this.areaDestino();
    const ids = [...this.seleccion()].sort((a, b) => a - b);

    if (areaId === null || ids.length === 0 || this.enviando()) {
      return;
    }

    this.enviando.set(true);

    this.catalogosService
      .asignarArea(ids, areaId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.enviando.set(false)),
      )
      .subscribe({
        next: ({ creados, puestos }) => {
          this.toast.show({
            type: 'success',
            title: 'Área asignada.',
            message: this.mensajeAsignacion(creados),
          });
          // The answer already carries the rows it touched, so the table
          // replaces them instead of asking for the whole list again.
          this.reemplazarPuestos(puestos);
          this.seleccion.set(new Set());
          this.modalAsignar.set(false);
          this.areaDestino.set(null);
          this.refrescarDiagnostico();
        },
        error: (error: unknown) => {
          this.toast.show({
            type: 'error',
            title: 'No se pudo asignar el área.',
            message: this.mensajeDeError(error),
          });
        },
      });
  }

  /**
   * Inline edit of the category of a post.
   *
   * `categoria_cct_id` is the only field of a post the backend still accepts, so
   * this is the one optimistic edit of the table. A `409 puesto_con_empleados`
   * means the post holds active employees: nothing changed, the control goes
   * back to the category the server still holds and a toast says why.
   */
  alCambiarCategoria(fila: TableRow, evento: Event): void {
    const puesto = this.puestoDe(this.idDe(fila));
    const valor = (evento.target as HTMLSelectElement).value;
    const categoriaCctId = Number(valor);

    if (puesto === null || valor === '' || Number.isNaN(categoriaCctId)) {
      return;
    }
    if (puesto.categoria !== null && puesto.categoria.id === categoriaCctId) {
      return;
    }

    const categoria = this.categoriaPorId(categoriaCctId);

    this.editarPuestoEnLinea(
      puesto,
      { categoria_cct_id: categoriaCctId },
      { categoria: categoria === null ? null : this.aCategoriaDePuesto(categoria) },
    );
  }

  /**
   * `DELETE /catalogos/puestos/{puesto}/areas/{area}` for one row.
   *
   * No confirmation step: removing an association is reversible by assigning the
   * area again. `desasociado: false` means the pair was already gone, so there is
   * nothing to take off the row; a `409 puesto_con_empleados` means the post
   * still has active employees there and nothing was removed.
   */
  desasociar(fila: TableRow, area: PuestoArea): void {
    const puesto = this.puestoDe(this.idDe(fila));

    if (puesto === null) {
      return;
    }

    const clave = `puesto-${puesto.id}`;

    if (this.ocupado(clave)) {
      return;
    }

    this.marcar(clave);

    this.catalogosService
      .desasociarArea(puesto.id, area.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.liberar(clave)),
      )
      .subscribe({
        next: ({ desasociado }) => {
          if (!desasociado) {
            return;
          }
          // The snapshot may have moved while the request was in flight, so the
          // row is read again instead of patching the copy this call captured.
          const actual = this.puestoDe(puesto.id) ?? puesto;
          this.reemplazarPuesto({
            ...actual,
            areas: actual.areas.filter((actualArea) => actualArea.id !== area.id),
          });
          this.refrescarDiagnostico();
        },
        error: (error: unknown) => {
          this.toast.show({
            type: 'error',
            title: 'No se quitó el área.',
            message: this.mensajeDeError(error),
          });
        },
      });
  }

  // --- Template helpers ------------------------------------------------------

  /** `id` of a row, without assuming the value is a number. */
  protected idDe(fila: TableRow): number {
    return Number(fila['id']);
  }

  /** Text of a row field, or an empty string. */
  protected textoDe(fila: TableRow, clave: string): string {
    const valor = fila[clave];
    return valor === null || valor === undefined ? '' : String(valor);
  }

  /** Number of a row field. `null` becomes `0`, which no real id uses. */
  protected numeroDe(fila: TableRow, clave: string): number {
    const valor = fila[clave];
    return typeof valor === 'number' ? valor : 0;
  }

  /** `true` when one post of the table is selected. */
  protected seleccionado(id: number): boolean {
    return this.seleccion().has(id);
  }

  /** `true` when the row is waiting for its request. */
  protected ocupado(clave: string): boolean {
    return this.guardando().has(clave);
  }

  /** Areas of the row, in the order the backend sent them. */
  protected areasDeFila(fila: TableRow): readonly PuestoArea[] {
    return this.puestoDe(this.idDe(fila))?.areas ?? [];
  }

  /**
   * Category the row declares when it is not among the offered ones.
   *
   * The selector only offers active categories, but a post may still declare one
   * that was deactivated: without this the control would print another category
   * as if it were the stored one.
   */
  protected categoriaFueraDeLista(fila: TableRow): CategoriaCatalogo | null {
    const actual = this.categoriaDeFila(fila);
    if (actual === null || actual.activo) {
      return null;
    }
    return actual;
  }

  /** Depth steps of a chart row, so the template can indent it. */
  protected pasosDe(fila: TableRow): readonly number[] {
    return Array.from({ length: this.numeroDe(fila, 'depth') }, (_, paso) => paso);
  }

  /** Sentence of one active diagnostic chip. */
  protected leyendaAviso(aviso: AvisoFiltro): string {
    return LEYENDAS_AVISO[aviso];
  }

  /** Drops one diagnostic narrowing, whichever it is. */
  protected quitarAviso(aviso: AvisoFiltro): void {
    if (aviso === 'sin-empleados') {
      this.limpiarSinEmpleados();
      return;
    }
    this.limpiarHallazgo();
  }

  /** Label of a tab. */
  protected etiquetaDe(tab: TabCatalogos): string {
    return ETIQUETAS_TAB[tab];
  }

  /** `true` when the failure block offers a retry. */
  protected puedeReintentar(): boolean {
    return this.error()?.accion === 'reintentar';
  }

  /** `true` when the session is gone, so the way out is the door. */
  protected pideSesion(): boolean {
    return this.error()?.accion === 'iniciar-sesion';
  }

  // --- Internals -------------------------------------------------------------

  /**
   * Query of the post list, built from the controls that need the backend.
   *
   * Only the three documented params are produced. There is no `area_id` in the
   * contract, so a concrete area is never sent — and must not be invented.
   */
  private filtrosPuestos(): PuestosFiltros {
    const filtros: PuestosFiltros = {};

    if (this.filtroArea() === SIN_AREA) {
      filtros.sin_area = true;
    }
    if (this.sinEmpleados()) {
      filtros.sin_empleados = true;
    }
    if (this.estado() === 'activos') {
      filtros.activo = true;
    } else if (this.estado() === 'inactivos') {
      filtros.activo = false;
    }

    return filtros;
  }

  /**
   * Runs a group of reads as one unit.
   *
   * Each source is caught so the batch always completes — a `forkJoin` that
   * fails on the first error would leave the other three requests in the air and
   * the failure would arrive with no idea of what else succeeded. The first
   * failure is remembered and mapped, and the caller gets `null` for the batch.
   */
  private leer<T extends object>(fuentes: {
    [K in keyof T]: Observable<T[K]>;
  }): Observable<T | null> {
    let fallo: unknown = null;

    const claves = Object.keys(fuentes) as (keyof T)[];
    const lecturas = claves.map((clave) =>
      fuentes[clave].pipe(
        catchError((error: unknown) => {
          if (fallo === null) {
            fallo = error;
          }
          return of(null);
        }),
      ),
    );

    return forkJoin(lecturas).pipe(
      map((valores) => {
        if (fallo !== null) {
          this.manejarError(fallo);
          return null;
        }

        const datos = {} as T;
        claves.forEach((clave, indice) => {
          datos[clave] = valores[indice] as T[keyof T];
        });
        return datos;
      }),
    );
  }

  /**
   * One GET of the post list under the current filters.
   *
   * A filter change is one request: the answer replaces the snapshot, so the
   * table can never mix rows of two different filter states.
   */
  private recargarPuestos(): void {
    this.recargando.set(true);

    this.catalogosService
      .puestos(this.filtrosPuestos())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.recargando.set(false)),
      )
      .subscribe({
        next: (puestos) => {
          this.puestos.set(puestos);
          this.podarSeleccion(puestos);
        },
        error: (error: unknown) => {
          this.toast.show({
            type: 'error',
            title: 'No se pudo aplicar el filtro.',
            message: this.mensajeDeError(error),
          });
        },
      });
  }

  /** Re-reads the posts and the diagnostics after a write that changed the set. */
  private refrescarPuestos(): void {
    this.leer({
      puestos: this.catalogosService.puestos(this.filtrosPuestos()),
      diagnostico: this.catalogosService.diagnostico(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((datos) => {
        if (datos === null) {
          return;
        }
        this.puestos.set(datos.puestos);
        this.diagnostico.set(datos.diagnostico);
        this.podarSeleccion(datos.puestos);
      });
  }

  /** Re-reads the counters after a write that changes what they count. */
  private refrescarDiagnostico(): void {
    this.catalogosService
      .diagnostico()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        catchError(() => of(null)),
      )
      .subscribe((diagnostico) => {
        if (diagnostico !== null) {
          this.diagnostico.set(diagnostico);
        }
      });
  }

  /**
   * One inline edit of a post: optimistic write, locked row, and a revert.
   *
   * `cambios` is what travels in the `PATCH`; `parche` is what the row shows
   * meanwhile — they differ because the server resolves the whole category from
   * the id, and the optimistic row cannot wait for it.
   */
  private editarPuestoEnLinea(
    puesto: PuestoCatalogo,
    cambios: EditarPuestoRequest,
    parche: Partial<PuestoCatalogo>,
  ): void {
    const clave = `puesto-${puesto.id}`;

    if (this.ocupado(clave)) {
      return;
    }

    this.reemplazarPuesto({ ...puesto, ...parche });
    this.marcar(clave);

    this.catalogosService
      .editarPuesto(puesto.id, cambios)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.liberar(clave)),
      )
      .subscribe({
        next: (actualizado) => {
          this.reemplazarPuesto(actualizado);
          this.refrescarDiagnostico();
        },
        error: (error: unknown) => {
          // The row goes back to what the server still holds: the control was
          // moved by the user, so only writing the old value back moves it home.
          // Nothing is refreshed: a rejected write changed nothing.
          this.reemplazarPuesto(puesto);
          this.toast.show({
            type: 'error',
            title: 'No se guardó el cambio.',
            message: this.mensajeDeError(error),
          });
        },
      });
  }

  /** Replaces one post of the snapshot, keeping the order of the list. */
  private reemplazarPuesto(actualizado: PuestoCatalogo): void {
    this.puestos.update((lista) =>
      (lista ?? []).map((puesto) => (puesto.id === actualizado.id ? actualizado : puesto)),
    );
  }

  /** Replaces a group of posts with the rows the backend already updated. */
  private reemplazarPuestos(actualizados: readonly PuestoCatalogo[]): void {
    if (actualizados.length === 0) {
      return;
    }

    const porId = new Map(actualizados.map((puesto) => [puesto.id, puesto]));
    this.puestos.update((lista) => (lista ?? []).map((puesto) => porId.get(puesto.id) ?? puesto));
  }

  /** Post of the snapshot by id, or `null`. */
  private puestoDe(id: number): PuestoCatalogo | null {
    return (this.puestos() ?? []).find((puesto) => puesto.id === id) ?? null;
  }

  /** Category of the snapshot by id, or `null` when it is not among the rows. */
  private categoriaPorId(id: number): CategoriaCatalogo | null {
    return (this.categorias() ?? []).find((categoria) => categoria.id === id) ?? null;
  }

  /** Category a row declares, with the full row the selector needs. */
  private categoriaDeFila(fila: TableRow): CategoriaCatalogo | null {
    const id = this.puestoDe(this.idDe(fila))?.categoria?.id;
    return id === undefined ? null : this.categoriaPorId(id);
  }

  /** The category of a post, cut down to what a post carries. */
  private aCategoriaDePuesto(categoria: CategoriaCatalogo): PuestoCategoria {
    return {
      id: categoria.id,
      clave: categoria.clave,
      tipo: categoria.tipo,
      descripcion: categoria.descripcion ?? '',
    };
  }

  /** `clave · descripción` of a category, without the dangling separator. */
  protected etiquetaCategoria(categoria: { clave: string; descripcion: string | null }): string {
    const descripcion = categoria.descripcion ?? '';
    return descripcion === '' ? categoria.clave : `${categoria.clave} · ${descripcion}`;
  }

  /** Names of the areas of a post, or a dash when it has none. */
  private etiquetaAreas(areas: readonly PuestoArea[]): string {
    return areas.length === 0 ? '—' : areas.map((area) => area.nombre).join(', ');
  }

  /** `Sí` / `No`, so a flag reads as a word and not as `true` / `false`. */
  private siNo(valor: boolean): string {
    return valor ? 'Sí' : 'No';
  }

  /** Sentence of the assign success, honest about a set that needed nothing. */
  private mensajeAsignacion(creados: number): string {
    if (creados === 0) {
      return 'No se creó ninguna asociación: los puestos ya estaban en esa área.';
    }
    return creados === 1
      ? 'Se creó 1 asociación nueva.'
      : `Se crearon ${this.formato.format(creados)} asociaciones nuevas.`;
  }

  /** Marks a row as waiting for its request. */
  private marcar(clave: string): void {
    const siguiente = new Set(this.guardando());
    siguiente.add(clave);
    this.guardando.set(siguiente);
  }

  /** Releases a row once its request is over, whatever the answer was. */
  private liberar(clave: string): void {
    const siguiente = new Set(this.guardando());
    siguiente.delete(clave);
    this.guardando.set(siguiente);
  }

  /** Drops the selected ids that the new snapshot no longer contains. */
  private podarSeleccion(puestos: readonly PuestoCatalogo[]): void {
    const vigentes = new Set(puestos.map((puesto) => puesto.id));
    const seleccion = this.seleccion();

    if ([...seleccion].every((id) => vigentes.has(id))) {
      return;
    }

    this.seleccion.set(new Set([...seleccion].filter((id) => vigentes.has(id))));
  }

  /** Clears every post filter at once. */
  private limpiarFiltros(): void {
    this.buscar.set('');
    this.termino.set('');
    this.filtroArea.set('');
    this.estado.set('todos');
    this.sinEmpleados.set(false);
    this.hallazgo.set('todos');
    this.pagina.set(1);
  }

  /** Maps a read failure to the sentence and the action the user gets. */
  private manejarError(error: unknown): void {
    const status = this.statusDe(error);
    const codigo = this.codigoDe(error);

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

  /**
   * Sentence of a failed write.
   *
   * The contract codes win over the status, because that is what the backend
   * promises; the status is the fallback for a failure with no body.
   */
  private mensajeDeError(error: unknown): string {
    const status = this.statusDe(error);
    const codigo = this.codigoDe(error);

    if (codigo === 'puesto_con_empleados') {
      return MENSAJE_PUESTO_EN_USO;
    }
    if (codigo === 'permiso_denegado' || status === 403) {
      return MENSAJE_PERMISO;
    }
    if (status === 401) {
      return MENSAJE_SESION;
    }
    if (status === 503) {
      return MENSAJE_SERVICIO;
    }
    // A conflict without a known code keeps the sentence of the body if it has
    // one; a generic "no connection" here would blame the network for a refusal.
    if (status === 409) {
      return this.mensajeDelCuerpo(error) ?? MENSAJE_CONFLICTO;
    }
    if (status === 422) {
      return this.mensajeDelCuerpo(error) ?? MENSAJE_INVALIDO;
    }

    return this.mensajeDelCuerpo(error) ?? MENSAJE_CONEXION;
  }

  /** Reads the general sentence out of an error body, or `null`. */
  private mensajeDelCuerpo(error: unknown): string | null {
    if (!(error instanceof HttpErrorResponse)) {
      return null;
    }

    const cuerpo = error.error as ErrorDominio | null;
    if (cuerpo === null || typeof cuerpo !== 'object') {
      return null;
    }

    const mensaje = cuerpo.mensaje;
    return typeof mensaje === 'string' && mensaje.trim() !== '' ? mensaje : null;
  }

  /** HTTP status, or `0` when the request never reached the server. */
  private statusDe(error: unknown): number {
    return error instanceof HttpErrorResponse ? error.status : 0;
  }

  /** Contract code of the failure, or `null`. */
  private codigoDe(error: unknown): string | null {
    if (!(error instanceof HttpErrorResponse)) {
      return null;
    }
    const cuerpo = error.error as ErrorDominio | null;
    return typeof cuerpo?.codigo === 'string' ? cuerpo.codigo : null;
  }
}
