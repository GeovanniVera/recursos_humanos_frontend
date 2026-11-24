import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { EMPTY, Subject, catchError, finalize, of, switchMap, tap, timer } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { puedeEditarEmpleado } from '../../core/auth/editar-empleado.guard';
import { FichaEmpleado } from '../../core/empleados/ficha.models';
import {
  ConfigRecordatoriosSemaforo,
  ConsultaSemaforo,
  EstadoExpediente,
  EstadoRecordatorioEmpleado,
  OrdenSemaforo,
  SemaforoResponse,
} from '../../core/semaforo/semaforo.models';
import { SemaforoService } from '../../core/semaforo/semaforo.service';
import { AlertBanner } from '../../shared/ui/alert-banner/alert-banner.component';
import { Button } from '../../shared/ui/button/button.component';
import { DataTable, TableColumn, TableDensity, TableRow } from '../../shared/ui/data-table/data-table.component';
import { Modal } from '../../shared/ui/modal/modal.component';
import { PageHeader } from '../../shared/ui/page-header/page-header.component';
import { Pagination } from '../../shared/ui/pagination/pagination.component';
import { RowFlag } from '../../shared/ui/row-flag/row-flag.component';
import { RowLink } from '../../shared/ui/row-link/row-link.component';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { EditarDrawer } from '../empleados/editar-drawer/editar-drawer.component';
import { FichaDrawer } from '../empleados/ficha-drawer/ficha-drawer.component';
import { ESTADOS_EXPEDIENTE } from './estado-expediente.component';
import { RecordatoriosDrawer } from './recordatorios-drawer/recordatorios-drawer.component';

/** Placeholder for a footer value with nothing to report. */
const SIN_DATO = '—';

@Component({
  selector: 'app-semaforo-page',
  imports: [
    AlertBanner,
    Button,
    DataTable,
    EditarDrawer,
    FichaDrawer,
    Modal,
    PageHeader,
    Pagination,
    RecordatoriosDrawer,
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
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
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

  /** Only SUPER_ADMIN (and SISTEMAS via role inheritance) manages reminders. */
  readonly puedeGestionarRecordatorios = computed(() => {
    const rol = this.auth.rol();
    return rol === 'SUPER_ADMIN' || rol === 'SISTEMAS';
  });

  readonly recordatoriosConfig = signal<ConfigRecordatoriosSemaforo | null>(null);
  readonly recordatoriosPorEmpleado = signal<Record<string, EstadoRecordatorioEmpleado>>({});
  readonly recordatoriosDrawerOpen = signal(false);
  readonly enviandoEmpleadoId = signal<number | null>(null);
  readonly loteEnviando = signal<'incompleto' | 'casi_completo' | null>(null);
  readonly confirmLoteGrupo = signal<'incompleto' | 'casi_completo' | null>(null);
  readonly confirmLoteOpen = computed(() => this.confirmLoteGrupo() !== null);
  readonly ahoraMs = signal(Date.now());

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

  /**
   * The four filters, in the order the strip shows them.
   *
   * `hint` is the line that explains the state without a legend: the thresholds
   * live on the tab that applies them, so the same rule is never printed twice.
   */
  readonly filtros: {
    estado: EstadoExpediente | undefined;
    label: string;
    hint: string;
    contador: 'total_evaluados' | 'completos' | 'casi_completos' | 'incompletos';
  }[] = [
    {
      estado: undefined,
      label: 'Todos',
      hint: 'Expedientes evaluados',
      contador: 'total_evaluados',
    },
    { estado: 'completo', label: 'Completos', hint: 'Sin pendientes', contador: 'completos' },
    {
      estado: 'casi_completo',
      label: 'Casi completos',
      hint: 'De 1 a 3 campos',
      contador: 'casi_completos',
    },
    { estado: 'incompleto', label: 'Incompletos', hint: '4 campos o más', contador: 'incompletos' },
  ];

  /** Row density of the sheet, chosen by the segmented control of its foot. */
  readonly densidad = signal<TableDensity>('standard');

  readonly densidades: readonly { id: TableDensity; label: string }[] = [
    { id: 'compact', label: 'Compacta' },
    { id: 'standard', label: 'Estándar' },
    { id: 'comfortable', label: 'Amplia' },
  ];

  readonly etiquetasEstado: Readonly<Record<string, string>> = ESTADOS_EXPEDIENTE;

  private readonly columnasBase: readonly TableColumn[] = [
    { key: 'num_empleado', header: 'No.', sortable: true },
    { key: 'nombre', header: 'Nombre', sortable: true },
    { key: 'adscripcion', header: 'Adscripción y plaza' },
    { key: 'campos_faltantes', header: 'Completitud', align: 'end', sortable: true },
  ];

  readonly columnas = computed<readonly TableColumn[]>(() =>
    this.puedeGestionarRecordatorios()
      ? [
          ...this.columnasBase,
          { key: 'recordatorio', header: 'Recordatorio', align: 'end' },
        ]
      : this.columnasBase,
  );

  readonly sort = computed(() => ({
    key: this.orden(),
    direction: this.direccion(),
  }));
  readonly filas = computed<TableRow[]>(() =>
    (this.respuesta()?.datos ?? []).map((e) => ({
      id: e.id,
      num_empleado: e.num_empleado,
      nombre: e.nombre,
      adscripcion: e.area?.nombre ?? 'Sin adscripción',
      plaza: e.puesto?.nombre ?? 'Sin plaza',
      estado: e.semaforo.estado,
      campos_faltantes: `${e.semaforo.campos_faltantes} / ${e.semaforo.total_campos}`,
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
    if (typeof window !== 'undefined') {
      const ticker = setInterval(() => this.ahoraMs.set(Date.now()), 60_000);
      this.destroyRef.onDestroy(() => clearInterval(ticker));
    }

    effect(() => {
      const puede = this.puedeGestionarRecordatorios();
      const resp = this.respuesta();
      if (!puede || !resp) {
        if (!puede) {
          this.recordatoriosConfig.set(null);
          this.recordatoriosPorEmpleado.set({});
        }
        return;
      }
      const ids = resp.datos.map((d) => d.id);
      this.cargarEstadoRecordatorios(ids);
    });

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
        takeUntilDestroyed(this.destroyRef),
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

  /**
   * Changes how much room a row gets.
   *
   * Density is presentation only: the rows on screen are the same page of the
   * same answer, so nothing is re-queried and nothing scrolls away.
   */
  cambiarDensidad(densidad: TableDensity): void {
    this.densidad.set(densidad);
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

  abrirRecordatoriosDrawer(): void {
    this.recordatoriosDrawerOpen.set(true);
  }

  alGuardarConfiguracion(cfg: ConfigRecordatoriosSemaforo): void {
    this.recordatoriosConfig.set(cfg);
    const ids = (this.respuesta()?.datos ?? []).map((d) => d.id);
    this.cargarEstadoRecordatorios(ids);
  }

  estadoRecordatorioDe(empleadoId: number): EstadoRecordatorioEmpleado | null {
    return this.recordatoriosPorEmpleado()[String(empleadoId)] ?? null;
  }

  segundosRestantesManual(empleadoId: number): number {
    const estado = this.estadoRecordatorioDe(empleadoId);
    if (!estado?.manual_disponible_desde) {
      return 0;
    }
    const target = Date.parse(estado.manual_disponible_desde);
    if (Number.isNaN(target)) {
      return estado.manual_en_cooldown ? estado.manual_segundos_restantes : 0;
    }
    return Math.max(0, Math.ceil((target - this.ahoraMs()) / 1000));
  }

  puedeEnviarManualRow(empleadoId: number): boolean {
    const estado = this.estadoRecordatorioDe(empleadoId);
    if (!estado || !estado.tiene_correo) {
      return false;
    }
    if (this.enviandoEmpleadoId() === empleadoId) {
      return false;
    }
    return this.segundosRestantesManual(empleadoId) === 0;
  }

  etiquetaBotonManual(empleadoId: number): string {
    if (this.enviandoEmpleadoId() === empleadoId) {
      return 'Enviando…';
    }
    const estado = this.estadoRecordatorioDe(empleadoId);
    if (!estado) {
      return 'Cargando…';
    }
    if (!estado.tiene_correo) {
      return 'Sin correo';
    }
    const restante = this.segundosRestantesManual(empleadoId);
    if (restante > 0) {
      return `Espera ${this.formatearDuracion(restante)}`;
    }
    return 'Enviar aviso';
  }

  textoAutoRecordatorio(empleadoId: number): string {
    const estado = this.estadoRecordatorioDe(empleadoId);
    if (!estado) {
      return 'Consultando…';
    }
    if (!estado.tiene_correo) {
      return 'Sin correo institucional';
    }
    if (!estado.proximo_envio_at) {
      return 'Auto: primer ciclo pendiente';
    }
    const target = Date.parse(estado.proximo_envio_at);
    if (Number.isNaN(target)) {
      return 'Auto: programado';
    }
    const segs = Math.max(0, Math.ceil((target - this.ahoraMs()) / 1000));
    return segs === 0 ? 'Auto: listo para envío' : `Auto en ${this.formatearDuracion(segs)}`;
  }

  segundosLoteRestantes(grupo: 'incompleto' | 'casi_completo'): number {
    const lote = this.recordatoriosConfig()?.lotes[grupo];
    if (!lote?.disponible_desde) {
      return 0;
    }
    const target = Date.parse(lote.disponible_desde);
    if (Number.isNaN(target)) {
      return lote.en_cooldown ? lote.segundos_restantes : 0;
    }
    return Math.max(0, Math.ceil((target - this.ahoraMs()) / 1000));
  }

  loteDeshabilitado(grupo: 'incompleto' | 'casi_completo'): boolean {
    if (this.loteEnviando() !== null || !this.recordatoriosConfig()) {
      return true;
    }
    const contadores = this.respuesta()?.contadores;
    const totalGrupo =
      grupo === 'incompleto' ? (contadores?.incompletos ?? 0) : (contadores?.casi_completos ?? 0);
    if (totalGrupo === 0) {
      return true;
    }
    return this.segundosLoteRestantes(grupo) > 0;
  }

  etiquetaBotonLote(grupo: 'incompleto' | 'casi_completo'): string {
    const base = grupo === 'incompleto' ? 'Enviar a Incompletos' : 'Enviar a Casi completos';
    const restante = this.segundosLoteRestantes(grupo);
    if (restante > 0) {
      return `${base} (${this.formatearDuracion(restante)})`;
    }
    return base;
  }

  enviarRecordatorioIndividual(row: TableRow): void {
    const id = Number(row['id']);
    if (!this.puedeEnviarManualRow(id)) {
      return;
    }
    this.enviandoEmpleadoId.set(id);
    this.api
      .enviarRecordatorioIndividual(id)
      .pipe(finalize(() => this.enviandoEmpleadoId.set(null)))
      .subscribe({
        next: (res) => {
          this.recordatoriosPorEmpleado.update((prev) => ({
            ...prev,
            [String(id)]: res.datos.empleado_estado,
          }));
          this.toast.show({
            type: 'success',
            title: 'Recordatorio enviado',
            message: `Se notificó a ${String(row['nombre'])} y se reinició su contador automático.`,
          });
        },
        error: (err: unknown) => {
          this.toast.show({
            type: 'error',
            title: 'No se pudo enviar el aviso',
            message: this.extraerMensajeError(err, 'Ocurrió un error al enviar el correo.'),
          });
        },
      });
  }

  solicitarConfirmacionLote(grupo: 'incompleto' | 'casi_completo'): void {
    if (this.loteDeshabilitado(grupo)) {
      return;
    }
    this.confirmLoteGrupo.set(grupo);
  }

  cerrarConfirmacionLote(open: boolean): void {
    if (!open) {
      this.confirmLoteGrupo.set(null);
    }
  }

  confirmarEnvioLote(): void {
    const grupo = this.confirmLoteGrupo();
    if (!grupo || this.loteEnviando() !== null) {
      return;
    }
    this.loteEnviando.set(grupo);
    this.api
      .enviarRecordatorioLote(grupo)
      .pipe(finalize(() => this.loteEnviando.set(null)))
      .subscribe({
        next: (res) => {
          this.confirmLoteGrupo.set(null);
          this.recordatoriosConfig.set(res.datos.config);
          const ids = (this.respuesta()?.datos ?? []).map((d) => d.id);
          this.cargarEstadoRecordatorios(ids);
          this.toast.show({
            type: 'success',
            title: 'Envío por lote completado',
            message: `${res.datos.enviados} enviados, ${res.datos.omitidos_cooldown} en espera y ${res.datos.omitidos_sin_correo} sin correo.`,
          });
        },
        error: (err: unknown) => {
          this.confirmLoteGrupo.set(null);
          this.toast.show({
            type: 'error',
            title: 'No se pudo completar el envío por lote',
            message: this.extraerMensajeError(err, 'Intenta nuevamente más tarde.'),
          });
        },
      });
  }

  private cargarEstadoRecordatorios(ids: readonly number[]): void {
    this.api.obtenerEstadoRecordatorios(ids).subscribe({
      next: (res) => {
        this.recordatoriosConfig.set(res.datos.config);
        this.recordatoriosPorEmpleado.set(res.datos.empleados);
      },
      error: () => {
        // Keep listing usable even if reminder metadata request fails transiently.
      },
    });
  }

  private formatearDuracion(segundos: number): string {
    const dias = Math.floor(segundos / 86400);
    const horas = Math.floor((segundos % 86400) / 3600);
    const minutos = Math.max(1, Math.floor((segundos % 3600) / 60));
    if (dias > 0) {
      return horas > 0 ? `${dias}d ${horas}h` : `${dias}d`;
    }
    if (horas > 0) {
      return `${horas}h`;
    }
    return `${minutos}m`;
  }

  private extraerMensajeError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const msg = err.error?.message;
      if (typeof msg === 'string' && msg.trim().length > 0) {
        return msg;
      }
    }
    return fallback;
  }
}
