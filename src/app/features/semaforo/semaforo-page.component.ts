import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, finalize, of, switchMap, tap, timer } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { puedeEditarEmpleado } from '../../core/auth/editar-empleado.guard';
import { FichaEmpleado } from '../../core/empleados/ficha.models';
import {
  ConsultaSemaforo,
  EstadoExpediente,
  OrdenSemaforo,
  SemaforoResponse,
} from '../../core/semaforo/semaforo.models';
import { SemaforoService } from '../../core/semaforo/semaforo.service';
import { AlertBanner } from '../../shared/ui/alert-banner/alert-banner.component';
import { Button } from '../../shared/ui/button/button.component';
import { DataTable, TableColumn, TableRow } from '../../shared/ui/data-table/data-table.component';
import { Pagination } from '../../shared/ui/pagination/pagination.component';
import { RowFlag } from '../../shared/ui/row-flag/row-flag.component';
import { RowLink } from '../../shared/ui/row-link/row-link.component';
import { EditarDrawer } from '../empleados/editar-drawer/editar-drawer.component';
import { FichaDrawer } from '../empleados/ficha-drawer/ficha-drawer.component';
import { ESTADOS_EXPEDIENTE } from './estado-expediente.component';

/** Placeholder for a footer value with nothing to report. */
const SIN_DATO = '—';

@Component({
  selector: 'app-semaforo-page',
  imports: [
    RouterLink,
    AlertBanner,
    Button,
    DataTable,
    EditarDrawer,
    FichaDrawer,
    Pagination,
    RowFlag,
    RowLink,
  ],
  templateUrl: './semaforo-page.component.html',
  styleUrl: './semaforo-page.component.scss',
})
export class SemaforoPage {
  private readonly api = inject(SemaforoService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly requests = new Subject<{
    consulta: ConsultaSemaforo;
    debounce: boolean;
    id: number;
  }>();
  private lastKey = '';
  private requestId = 0;
  readonly buscar = signal('');
  readonly estado = signal<EstadoExpediente | undefined>(undefined);
  readonly pagina = signal(1);
  readonly porPagina = signal(25);
  readonly orden = signal<OrdenSemaforo>('num_empleado');
  readonly direccion = signal<'asc' | 'desc'>('asc');
  readonly respuesta = signal<SemaforoResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly status = signal(0);
  readonly drawerOpen = signal(false);
  readonly empleadoId = signal<number | null>(null);

  /**
   * Internal key of the worker whose edit folder is open, or `null`.
   *
   * The folder is mounted once and gains its id from the pencil of the record,
   * exactly as it does on the roster: one folder for the whole screen.
   */
  readonly editarId = signal<number | null>(null);

  /** Whether the edit folder is open. Two-way bound to it. */
  readonly edicionAbierta = signal(false);

  /**
   * The pencil follows the same rule here as on the roster: the role decides,
   * and the route guard is not needed because nothing navigates.
   */
  readonly puedeEditar = computed(() => puedeEditarEmpleado(this.auth.rol()));

  /**
   * Completeness of the worker on screen, read from the row the user opened.
   *
   * It is read from the list and not copied at click time: a reload after an
   * edit replaces the page, and the figures the `Estado` sheet prints have to be
   * the ones the server just computed. A row that disappeared from the list
   * leaves the drawer without the block instead of with stale numbers.
   */
  readonly completitud = computed(() => {
    const id = this.empleadoId();
    if (id === null) {
      return null;
    }
    return (this.respuesta()?.datos ?? []).find((e) => e.id === id)?.semaforo ?? null;
  });

  readonly errorPagina = signal<string | null>(null);
  readonly tamanos = [10, 25, 50, 100];
  private readonly formato = new Intl.NumberFormat('es-MX');
  readonly filtros: {
    estado: EstadoExpediente | undefined;
    label: string;
    contador: 'total_evaluados' | 'completos' | 'casi_completos' | 'incompletos';
  }[] = [
    { estado: undefined, label: 'Todos', contador: 'total_evaluados' },
    { estado: 'completo', label: 'Completos', contador: 'completos' },
    {
      estado: 'casi_completo',
      label: 'Casi completos',
      contador: 'casi_completos',
    },
    { estado: 'incompleto', label: 'Incompletos', contador: 'incompletos' },
  ];
  readonly etiquetasEstado: Readonly<Record<string, string>> = ESTADOS_EXPEDIENTE;
  readonly columnas: readonly TableColumn[] = [
    { key: 'num_empleado', header: 'No.', sortable: true },
    { key: 'nombre', header: 'Nombre', sortable: true },
    { key: 'area', header: 'Adscripción' },
    { key: 'puesto', header: 'Plaza' },
    { key: 'campos_faltantes', header: 'Campos faltantes', sortable: true },
  ];
  readonly sort = computed(() => ({
    key: this.orden(),
    direction: this.direccion(),
  }));
  readonly filas = computed<TableRow[]>(() =>
    (this.respuesta()?.datos ?? []).map((e) => ({
      id: e.id,
      num_empleado: e.num_empleado,
      nombre: e.nombre,
      area: e.area?.nombre ?? 'Sin adscripción',
      puesto: e.puesto?.nombre ?? 'Sin plaza',
      estado: e.semaforo.estado,
      campos_faltantes: `${e.semaforo.campos_faltantes} de ${e.semaforo.total_campos}`,
    })),
  );
  /**
   * The footer only exists once a response has arrived: before the first answer
   * there is no page count to honour, and after a failure there are no rows.
   */
  readonly hayDatos = computed(() => this.respuesta() !== null);

  /** The server owns the page count; it is never recomputed from the row count. */
  readonly totalPaginas = computed(() => this.respuesta()?.meta.total_paginas ?? 1);

  /** Upper bound of the "Ir a página" field. An empty listing still has one page. */
  readonly totalPaginasMax = computed(() => Math.max(this.totalPaginas(), 1));

  /** `Mostrando 1 a 25 de 127 expedientes`. */
  readonly rango = computed(() => {
    const meta = this.respuesta()?.meta;
    if (this.loading()) return 'Consultando expedientes…';
    if (!meta) return SIN_DATO;
    if (meta.total === 0) return 'Sin resultados';
    const inicio = (meta.pagina - 1) * meta.por_pagina + 1;
    const fin = Math.min(inicio + meta.por_pagina - 1, meta.total);
    return `Mostrando ${this.formato.format(inicio)} a ${this.formato.format(fin)} de ${this.formato.format(meta.total)} expedientes`;
  });

  /**
   * `Página 3 de 6`. Reads `pagina()` and not `meta.pagina`: while a request is
   * in flight the two disagree, and the label must match the guards the user sees.
   */
  readonly etiquetaPagina = computed(
    () =>
      `Página ${this.formato.format(this.pagina())} de ${this.formato.format(this.totalPaginasMax())}`,
  );

  /** A load in flight freezes every control that would ask for another page. */
  readonly controlesDeshabilitados = computed(() => this.loading());

  readonly primeraDeshabilitado = computed(
    () => this.controlesDeshabilitados() || this.pagina() <= 1,
  );

  readonly anteriorDeshabilitado = computed(
    () => this.controlesDeshabilitados() || this.pagina() <= 1,
  );

  readonly siguienteDeshabilitado = computed(
    () => this.controlesDeshabilitados() || this.pagina() >= this.totalPaginas(),
  );

  readonly ultimaDeshabilitado = computed(
    () => this.controlesDeshabilitados() || this.pagina() >= this.totalPaginas(),
  );

  constructor() {
    this.requests
      .pipe(
        switchMap(({ consulta, debounce, id }) => {
          this.loading.set(true);
          this.error.set(null);
          this.status.set(0);
          return (debounce ? timer(300) : of(0)).pipe(
            switchMap(() => this.api.consultar(consulta)),
            tap((r) => {
              if (r.meta.pagina > Math.max(1, r.meta.total_paginas)) {
                this.pagina.set(Math.max(1, r.meta.total_paginas));
                this.solicitar();
                return;
              }
              this.respuesta.set(r);
            }),
            catchError((e: unknown) => {
              const status = e instanceof HttpErrorResponse ? e.status : 0;
              this.status.set(status);
              this.respuesta.set(null);
              this.error.set(
                status === 401
                  ? 'Tu sesión venció. Inicia sesión nuevamente.'
                  : status === 403
                    ? 'No tienes permiso para consultar el semáforo de completitud.'
                    : status === 429
                      ? 'Has realizado varias consultas. Espera un momento antes de reintentar.'
                      : 'No pudimos cargar los expedientes. Revisa tu conexión e intenta nuevamente.',
              );
              return EMPTY;
            }),
            finalize(() => {
              if (id === this.requestId) this.loading.set(false);
            }),
          );
        }),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe();
    this.solicitar();
  }

  solicitar(debounce = false, force = false): void {
    const consulta: ConsultaSemaforo = {
      buscar: this.buscar().trim() || undefined,
      estado: this.estado(),
      pagina: this.pagina(),
      por_pagina: this.porPagina(),
      ordenar_por: this.orden(),
      direccion: this.direccion(),
    };
    const key = JSON.stringify(consulta);
    if (!force && key === this.lastKey) return;
    this.lastKey = key;
    this.requests.next({ consulta, debounce, id: ++this.requestId });
  }
  alBuscar(event: Event): void {
    this.buscar.set((event.target as HTMLInputElement).value);
    this.pagina.set(1);
    this.solicitar(true);
  }
  filtrar(estado: EstadoExpediente | undefined): void {
    this.estado.set(estado);
    this.pagina.set(1);
    this.solicitar();
  }
  ordenar(key: string): void {
    if (!['estado', 'num_empleado', 'nombre', 'campos_faltantes'].includes(key)) return;
    this.direccion.set(this.orden() === key && this.direccion() === 'asc' ? 'desc' : 'asc');
    this.orden.set(key as OrdenSemaforo);
    this.pagina.set(1);
    this.solicitar();
  }
  /**
   * Changes how many rows a page holds. A different size is a different window
   * over the server-side listing, so it restarts at page 1 and re-queries.
   */
  cambiarPorPagina(event: Event): void {
    const n = Number((event.target as HTMLSelectElement).value);
    this.cambiarTamanoPagina(n);
  }
  cambiarTamanoPagina(n: number): void {
    if (!Number.isFinite(n) || !this.tamanos.includes(n) || n === this.porPagina()) return;
    this.errorPagina.set(null);
    this.porPagina.set(n);
    this.pagina.set(1);
    this.solicitar();
  }
  irA(n: number): void {
    if (this.loading() || n < 1 || n > this.totalPaginasMax()) return;
    this.errorPagina.set(null);
    this.pagina.set(n);
    this.solicitar();
  }
  irAPrimera(): void {
    this.irA(1);
  }
  irAUltima(): void {
    this.irA(this.totalPaginas());
  }
  /**
   * Jump from the "Ir a página" field.
   *
   * The field is a real number input with the range as its `max`, but a number
   * input still lets a typed value through, and a page out of range would spend
   * a request on an answer the backend cannot give.
   */
  irAPaginaDesdeCampo(event: Event, valor: string): void {
    event.preventDefault();
    this.irAPaginaValor(valor);
  }
  irAPaginaValor(valor: string): void {
    if (this.loading()) {
      return;
    }

    const destino = Number(valor);
    const maximo = this.totalPaginasMax();

    if (!Number.isInteger(destino) || destino < 1 || destino > maximo) {
      this.errorPagina.set(`Ingresa un número entre 1 y ${this.formato.format(maximo)}.`);
      return;
    }

    this.irA(destino);
  }
  abrir(row: TableRow): void {
    this.empleadoId.set(Number(row['id']));
    this.drawerOpen.set(true);
  }

  /**
   * Opens the edit folder on the record's worker.
   *
   * The pencil of the record emits, and this screen does what the roster does:
   * the record leaves — keeping it open would show the worker the user is
   * already changing somewhere else — and the third folder takes the key.
   */
  editarEmpleado(id: number): void {
    this.drawerOpen.set(false);
    this.editarId.set(id);
    this.edicionAbierta.set(true);
  }

  /**
   * An edit just landed: the list is asked for again.
   *
   * Every figure this screen shows — the percentages, the counters, the row's
   * `Campos faltantes` — belongs to the listing, so the answer behind a record
   * that was just corrected is no longer true. The request is forced because the
   * query did not change and `solicitar` would otherwise skip it as a duplicate.
   */
  alActualizarEmpleado(empleado: FichaEmpleado): void {
    this.errorPagina.set(null);
    this.solicitar(false, true);
  }

  /** Same refresh after a termination, and for the same reason. */
  alRegistrarBaja(): void {
    this.errorPagina.set(null);
    this.solicitar(false, true);
  }

  iniciarSesion(): void {
    void this.router.navigate(['/login']);
  }
}
