import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import {
  BitacoraDetalle,
  BitacoraDetalleResponse,
  BitacoraError,
  BitacoraListadoResponse,
  BitacoraMovimiento,
  BitacoraOrden,
} from '../../core/bitacora/bitacora.models';
import { BitacoraService, ConsultaBitacora } from '../../core/bitacora/bitacora.service';
import { AlertBanner } from '../../shared/ui/alert-banner/alert-banner.component';
import { Button } from '../../shared/ui/button/button.component';
import { DataTable, TableColumn, TableRow } from '../../shared/ui/data-table/data-table.component';
import { PageHeader } from '../../shared/ui/page-header/page-header.component';
import { Pagination } from '../../shared/ui/pagination/pagination.component';
import { RowLink } from '../../shared/ui/row-link/row-link.component';
import { BitacoraDetalleDrawerComponent } from './bitacora-detalle-drawer.component';

const RETRASO_BUSQUEDA = 300;
const TAMANOS_PAGINA = [10, 20, 50, 100] as const;
const MODULO_PATTERN = /^[A-Za-z0-9._-]*$/;
const ACCION_PATTERN = /^[A-Za-z0-9._-]*$/;
const FECHA_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const FORMATO_FECHA = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Mexico_City',
});

const FORMATO_NUMERO = new Intl.NumberFormat('es-MX');

interface FiltrosBitacora {
  modulo: string;
  accion: string;
  usuarioId: string;
  buscar: string;
  fechaDesde: string;
  fechaHasta: string;
}

const FILTROS_VACIOS: FiltrosBitacora = {
  modulo: '',
  accion: '',
  usuarioId: '',
  buscar: '',
  fechaDesde: '',
  fechaHasta: '',
};

interface ErroresCampos {
  modulo?: string;
  accion?: string;
  usuarioId?: string;
  buscar?: string;
  fechaDesde?: string;
  fechaHasta?: string;
}

type ListadoErrorAction = 'reintentar' | 'iniciar-sesion' | 'ninguna';

interface FallaListado {
  status: number;
  mensaje: string;
  codigo: string | null;
  campo: string | null;
  accion: ListadoErrorAction;
  segundos: number | null;
}

interface FallaDetalle {
  status: number;
  mensaje: string;
  codigo: string | null;
  accion: 'reintentar' | 'ninguna' | 'recargar';
  segundos: number | null;
}

@Component({
  selector: 'app-bitacora-page',
  imports: [
    AlertBanner,
    Button,
    DataTable,
    PageHeader,
    Pagination,
    RowLink,
    BitacoraDetalleDrawerComponent,
  ],
  templateUrl: './bitacora-page.component.html',
  styleUrl: './bitacora-page.component.scss',
})
export class BitacoraPage {
  private readonly service = inject(BitacoraService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly filtros = signal<FiltrosBitacora>({ ...FILTROS_VACIOS });
  readonly pagina = signal(1);
  readonly porPagina = signal(20);
  readonly orden = signal<BitacoraOrden>('desc');

  readonly cargando = signal(false);
  readonly respuesta = signal<BitacoraListadoResponse | null>(null);
  readonly error = signal<unknown>(null);
  readonly espera = signal(0);

  readonly erroresCampos = signal<ErroresCampos>({});

  readonly detalleAbierto = signal(false);
  readonly detalleCargando = signal(false);
  readonly detalle = signal<BitacoraDetalle | null>(null);
  readonly detalleError = signal<unknown>(null);
  readonly detalleId = signal<number | null>(null);

  readonly tamanosPagina = TAMANOS_PAGINA;

  readonly columnas: readonly TableColumn[] = [
    { key: 'fecha', header: 'Fecha', width: '9.5rem' },
    { key: 'usuario_historico', header: 'Actor', width: '11rem' },
    { key: 'accion', header: 'Acción', width: '9rem' },
    { key: 'modulo', header: 'Módulo', width: '8rem' },
    { key: 'descripcion', header: 'Descripción' },
  ];

  private readonly terminos = new Subject<string>();
  private listadoSub: Subscription | null = null;
  private detalleSub: Subscription | null = null;
  private relojId: ReturnType<typeof setInterval> | null = null;
  private busquedaDiferida: string | null = null;
  private sincronizandoUrl = false;
  private clavesUrlActuales = '';

  readonly cargandoInicial = computed(() => this.cargando() && this.respuesta() === null);
  readonly controlesDeshabilitados = computed(() => this.cargando() || this.espera() > 0);

  readonly falla = computed<FallaListado | null>(() => this.describirError(this.error()));
  readonly fallaDetalle = computed<FallaDetalle | null>(() => this.describirErrorDetalle(this.detalleError()));

  readonly filas = computed<readonly TableRow[]>(() =>
    (this.respuesta()?.datos ?? []).map((movimiento) => ({
      id: movimiento.id,
      fecha: movimiento.fecha,
      usuario_id: movimiento.usuario_id,
      usuario_historico: movimiento.usuario_historico,
      accion: movimiento.accion,
      modulo: movimiento.modulo,
      descripcion: movimiento.descripcion,
    })),
  );

  readonly meta = computed(() => this.respuesta()?.meta ?? null);

  readonly rango = computed(() => {
    const meta = this.meta();
    if (!meta) {
      return '—';
    }
    if (meta.total === 0) {
      return 'Sin movimientos';
    }
    const desde = (meta.pagina - 1) * meta.por_pagina + 1;
    const hasta = Math.min(meta.pagina * meta.por_pagina, meta.total);
    return `Mostrando ${FORMATO_NUMERO.format(desde)}–${FORMATO_NUMERO.format(hasta)} de ${FORMATO_NUMERO.format(meta.total)}`;
  });

  readonly etiquetaPagina = computed(() => {
    const meta = this.meta();
    if (!meta) {
      return '—';
    }
    return `Página ${FORMATO_NUMERO.format(meta.pagina)} de ${FORMATO_NUMERO.format(Math.max(meta.total_paginas, 1))}`;
  });

  readonly totalPaginas = computed(() => Math.max(this.meta()?.total_paginas ?? 1, 1));
  readonly hayDatos = computed(() => this.respuesta() !== null);

  readonly subtitulo = computed(() => {
    const f = this.filtros();
    const ordenLabel = this.orden() === 'desc' ? 'Más recientes primero' : 'Más antiguos primero';
    let ventana = 'Últimos 30 días';
    if (f.fechaDesde && f.fechaHasta) {
      ventana = f.fechaDesde === f.fechaHasta ? `Día ${f.fechaDesde}` : `Del ${f.fechaDesde} al ${f.fechaHasta}`;
    } else if (f.fechaDesde) {
      ventana = `Desde ${f.fechaDesde}`;
    } else if (f.fechaHasta) {
      ventana = `Hasta ${f.fechaHasta}`;
    }
    return `${ventana} · ${ordenLabel}`;
  });

  readonly mensajeVacio = computed(() => {
    if (this.falla() !== null && this.respuesta() === null) {
      return 'No se pudo cargar la bitácora.';
    }
    const f = this.filtros();
    const hayFiltros = !!(
      f.modulo.trim() ||
      f.accion.trim() ||
      f.usuarioId.trim() ||
      f.buscar.trim() ||
      f.fechaDesde ||
      f.fechaHasta
    );
    if (hayFiltros) {
      return 'No hay movimientos que coincidan con los filtros.';
    }
    if (!f.fechaDesde && !f.fechaHasta) {
      return 'No hay movimientos en los últimos 30 días.';
    }
    return 'Todavía no hay movimientos registrados.';
  });

  constructor() {
    this.terminos
      .pipe(debounceTime(RETRASO_BUSQUEDA), takeUntilDestroyed(this.destroyRef))
      .subscribe((termino) => this.aplicarTermino(termino));

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => this.alCambiarUrl(params));

    // Manejo de cuenta regresiva compartida 429
    effect(() => {
      const listado = this.falla();
      const detalle = this.fallaDetalle();
      const fuente = listado?.status === 429 ? listado : detalle?.status === 429 ? detalle : null;
      if (fuente && fuente.segundos !== null && fuente.segundos > 0 && this.espera() === 0 && this.relojId === null) {
        this.iniciarEspera(fuente.segundos);
      }
      if (listado?.status !== 429 && detalle?.status !== 429 && this.espera() === 0) {
        this.detenerReloj();
      }
    });

    this.destroyRef.onDestroy(() => {
      this.detenerReloj();
      this.listadoSub?.unsubscribe();
      this.detalleSub?.unsubscribe();
    });

    const inicial = this.leerUrl(this.route.snapshot.queryParamMap);
    this.aplicarEstado(inicial.filtros, inicial.pagina, inicial.orden);
    this.clavesUrlActuales = this.clavesUrl(inicial.filtros, inicial.pagina, inicial.orden);

    if (inicial.huboNormalizacion) {
      void this.sincronizarUrl(inicial.filtros, inicial.pagina, inicial.orden, true);
    }
    this.cargar();
  }

  private leerUrl(params: ParamMap): {
    filtros: FiltrosBitacora;
    pagina: number;
    orden: BitacoraOrden;
    huboNormalizacion: boolean;
  } {
    let huboNormalizacion = false;

    const paginaRaw = params.get('pagina');
    let pagina = 1;
    if (paginaRaw !== null) {
      const n = Number(paginaRaw);
      if (Number.isInteger(n) && n >= 1) {
        pagina = n;
      } else {
        huboNormalizacion = true;
      }
    }

    const ordenRaw = params.get('orden');
    let orden: BitacoraOrden = 'desc';
    if (ordenRaw === 'asc' || ordenRaw === 'desc') {
      orden = ordenRaw;
    } else if (ordenRaw !== null) {
      huboNormalizacion = true;
    }

    const filtros: FiltrosBitacora = {
      modulo: params.get('modulo') ?? '',
      accion: params.get('accion') ?? '',
      usuarioId: params.get('usuario_id') ?? '',
      buscar: '',
      fechaDesde: params.get('fecha_desde') ?? '',
      fechaHasta: params.get('fecha_hasta') ?? '',
    };

    if (filtros.modulo && (filtros.modulo.length > 100 || !MODULO_PATTERN.test(filtros.modulo))) {
      filtros.modulo = '';
      huboNormalizacion = true;
    }
    if (filtros.accion && (filtros.accion.length > 50 || !ACCION_PATTERN.test(filtros.accion))) {
      filtros.accion = '';
      huboNormalizacion = true;
    }
    if (filtros.usuarioId) {
      const n = Number(filtros.usuarioId);
      if (!Number.isInteger(n) || n < 1) {
        filtros.usuarioId = '';
        huboNormalizacion = true;
      }
    }
    if (filtros.fechaDesde && !FECHA_PATTERN.test(filtros.fechaDesde)) {
      filtros.fechaDesde = '';
      huboNormalizacion = true;
    }
    if (filtros.fechaHasta && !FECHA_PATTERN.test(filtros.fechaHasta)) {
      filtros.fechaHasta = '';
      huboNormalizacion = true;
    }
    if (filtros.fechaDesde && filtros.fechaHasta && filtros.fechaDesde > filtros.fechaHasta) {
      filtros.fechaHasta = '';
      huboNormalizacion = true;
    }

    return { filtros, pagina, orden, huboNormalizacion };
  }

  private aplicarEstado(filtros: FiltrosBitacora, pagina: number, orden: BitacoraOrden): void {
    this.filtros.set({ ...filtros });
    this.pagina.set(pagina);
    this.orden.set(orden);
  }

  private clavesUrl(filtros: FiltrosBitacora, pagina: number, orden: BitacoraOrden): string {
    return JSON.stringify({
      modulo: filtros.modulo,
      accion: filtros.accion,
      usuarioId: filtros.usuarioId,
      fechaDesde: filtros.fechaDesde,
      fechaHasta: filtros.fechaHasta,
      pagina,
      orden,
    });
  }

  private alCambiarUrl(params: ParamMap): void {
    if (this.sincronizandoUrl) {
      return;
    }
    const estado = this.leerUrl(params);
    const nuevasClaves = this.clavesUrl(estado.filtros, estado.pagina, estado.orden);
    if (nuevasClaves === this.clavesUrlActuales) {
      return;
    }

    this.clavesUrlActuales = nuevasClaves;
    this.aplicarEstado({ ...estado.filtros, buscar: this.filtros().buscar }, estado.pagina, estado.orden);

    if (estado.huboNormalizacion) {
      void this.sincronizarUrl(estado.filtros, estado.pagina, estado.orden, true);
    }
    this.cargar();
  }

  private sincronizarUrl(
    filtros: FiltrosBitacora,
    pagina: number,
    orden: BitacoraOrden,
    reemplazar: boolean,
  ): Promise<boolean> {
    this.sincronizandoUrl = true;
    this.clavesUrlActuales = this.clavesUrl(filtros, pagina, orden);
    const queryParams: Record<string, string | number | null> = {
      pagina: pagina === 1 ? null : pagina,
      orden: orden === 'desc' ? null : orden,
      modulo: filtros.modulo.trim() || null,
      accion: filtros.accion.trim() || null,
      usuario_id: filtros.usuarioId.trim() || null,
      fecha_desde: filtros.fechaDesde || null,
      fecha_hasta: filtros.fechaHasta || null,
    };

    return this.router
      .navigate([], {
        relativeTo: this.route,
        queryParams,
        queryParamsHandling: 'merge',
        replaceUrl: reemplazar,
      })
      .finally(() => {
        this.sincronizandoUrl = false;
      });
  }

  private validarModulo(valor: string): string | null {
    const v = valor.trim();
    if (v.length > 100) return 'El módulo debe tener máximo 100 caracteres.';
    if (!MODULO_PATTERN.test(v)) return 'Usa solo letras, números, punto, guion y guion bajo.';
    return null;
  }

  private validarAccion(valor: string): string | null {
    const v = valor.trim();
    if (v.length > 50) return 'La acción debe tener máximo 50 caracteres.';
    if (!ACCION_PATTERN.test(v)) return 'Usa solo letras, números, punto, guion y guion bajo.';
    return null;
  }

  private validarUsuarioId(valor: string): string | null {
    const v = valor.trim();
    if (!v) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) return 'Ingresa un entero mayor o igual a 1.';
    return null;
  }

  private validarBuscar(valor: string): string | null {
    if (valor.length > 150) return 'La búsqueda debe tener máximo 150 caracteres.';
    return null;
  }

  private validarFechas(desde: string, hasta: string): { desde?: string; hasta?: string } {
    const errores: { desde?: string; hasta?: string } = {};
    if (desde && !FECHA_PATTERN.test(desde)) errores.desde = 'La fecha inicial no es válida.';
    if (hasta && !FECHA_PATTERN.test(hasta)) errores.hasta = 'La fecha final no es válida.';
    if (!errores.desde && !errores.hasta && desde && hasta && desde > hasta) {
      errores.hasta = 'La fecha final debe ser mayor o igual a la inicial.';
    }
    return errores;
  }

  private validarTodos(f: FiltrosBitacora): ErroresCampos {
    const errores: ErroresCampos = {};
    const m = this.validarModulo(f.modulo); if (m) errores.modulo = m;
    const a = this.validarAccion(f.accion); if (a) errores.accion = a;
    const u = this.validarUsuarioId(f.usuarioId); if (u) errores.usuarioId = u;
    const b = this.validarBuscar(f.buscar); if (b) errores.buscar = b;
    const fechas = this.validarFechas(f.fechaDesde, f.fechaHasta);
    if (fechas.desde) errores.fechaDesde = fechas.desde;
    if (fechas.hasta) errores.fechaHasta = fechas.hasta;
    return errores;
  }

  private tieneErroresBloqueantes(errores: ErroresCampos): boolean {
    return !!(errores.modulo || errores.accion || errores.usuarioId || errores.buscar || errores.fechaDesde || errores.fechaHasta);
  }

  private construirConsulta(): ConsultaBitacora | null {
    const f = this.filtros();
    const errores = this.validarTodos(f);
    this.erroresCampos.set(errores);
    if (this.tieneErroresBloqueantes(errores)) {
      return null;
    }

    const consulta: ConsultaBitacora = {
      pagina: this.pagina(),
      porPagina: this.porPagina(),
    };
    if (this.orden() === 'asc') consulta.orden = 'asc';

    const modulo = f.modulo.trim(); if (modulo) consulta.modulo = modulo;
    const accion = f.accion.trim(); if (accion) consulta.accion = accion;
    const buscar = f.buscar.trim(); if (buscar) consulta.buscar = buscar;
    const usuarioRaw = f.usuarioId.trim();
    if (usuarioRaw) {
      const n = Number(usuarioRaw);
      if (Number.isInteger(n) && n >= 1) consulta.usuarioId = n;
    }
    if (f.fechaDesde && FECHA_PATTERN.test(f.fechaDesde)) consulta.fechaDesde = f.fechaDesde;
    if (f.fechaHasta && FECHA_PATTERN.test(f.fechaHasta)) consulta.fechaHasta = f.fechaHasta;

    return consulta;
  }

  cargar(): void {
    if (this.espera() > 0) {
      return;
    }
    const consulta = this.construirConsulta();
    if (!consulta) {
      return;
    }
    this.listadoSub?.unsubscribe();
    this.cargando.set(true);
    this.error.set(null);
    this.listadoSub = this.service.consultar(consulta).subscribe({
      next: (respuesta) => {
        this.respuesta.set(respuesta);
        this.pagina.set(respuesta.meta.pagina);
        this.cargando.set(false);
      },
      error: (err) => {
        this.error.set(err);
        this.cargando.set(false);
        this.aplicarErrorCampos(err);
      },
    });
  }

  reintentar(): void {
    if (this.espera() > 0) return;
    this.error.set(null);
    this.cargar();
  }

  private aplicarErrorCampos(err: unknown): void {
    if (!(err instanceof HttpErrorResponse) || err.status !== 400) return;
    const body = err.error as BitacoraError | null;
    const campo = body?.campo;
    const mensaje = body?.mensaje ?? body?.message;
    if (!campo || !mensaje) return;
    const mapa: Record<string, keyof ErroresCampos> = {
      modulo: 'modulo',
      accion: 'accion',
      usuario_id: 'usuarioId',
      buscar: 'buscar',
      fecha_desde: 'fechaDesde',
      fecha_hasta: 'fechaHasta',
    };
    const key = mapa[campo];
    if (key) {
      this.erroresCampos.update((e) => ({ ...e, [key]: mensaje }));
    }
  }

  onFiltroTexto(campo: 'modulo' | 'accion', valor: string): void {
    this.filtros.update((f) => ({ ...f, [campo]: valor }));
    const errores = { ...this.erroresCampos() };
    const msg = campo === 'modulo' ? this.validarModulo(valor) : this.validarAccion(valor);
    if (msg) errores[campo] = msg; else delete errores[campo];
    this.erroresCampos.set(errores);
  }

  confirmarFiltroTexto(campo: 'modulo' | 'accion'): void {
    const msg = campo === 'modulo' ? this.validarModulo(this.filtros().modulo) : this.validarAccion(this.filtros().accion);
    if (msg) return;
    this.aplicarCambioFiltros();
  }

  onUsuarioId(valor: string): void {
    this.filtros.update((f) => ({ ...f, usuarioId: valor }));
    const errores = { ...this.erroresCampos() };
    const msg = this.validarUsuarioId(valor);
    if (msg) errores.usuarioId = msg; else delete errores.usuarioId;
    this.erroresCampos.set(errores);
  }

  confirmarUsuarioId(): void {
    if (this.validarUsuarioId(this.filtros().usuarioId)) return;
    this.aplicarCambioFiltros();
  }

  onFecha(campo: 'fechaDesde' | 'fechaHasta', valor: string): void {
    this.filtros.update((f) => ({ ...f, [campo]: valor }));
    const f = this.filtros();
    const errores = { ...this.erroresCampos() };
    const fechas = this.validarFechas(f.fechaDesde, f.fechaHasta);
    if (fechas.desde) errores.fechaDesde = fechas.desde; else delete errores.fechaDesde;
    if (fechas.hasta) errores.fechaHasta = fechas.hasta; else delete errores.fechaHasta;
    this.erroresCampos.set(errores);
    if (!fechas.desde && !fechas.hasta) {
      this.aplicarCambioFiltros();
    }
  }

  onBuscar(valor: string): void {
    this.filtros.update((f) => ({ ...f, buscar: valor }));
    const errores = { ...this.erroresCampos() };
    const msg = this.validarBuscar(valor);
    if (msg) errores.buscar = msg; else delete errores.buscar;
    this.erroresCampos.set(errores);
    this.terminos.next(valor);
  }

  private aplicarTermino(termino: string): void {
    if (this.validarBuscar(termino)) return;
    if (this.espera() > 0) {
      this.busquedaDiferida = termino;
      return;
    }
    this.busquedaDiferida = null;
    this.aplicarCambioFiltros();
  }

  onOrden(valor: string): void {
    const orden: BitacoraOrden = valor === 'asc' ? 'asc' : 'desc';
    if (orden === this.orden()) return;
    this.orden.set(orden);
    this.pagina.set(1);
    void this.sincronizarUrl(this.filtros(), 1, orden, false);
    this.cargar();
  }

  limpiarFiltros(): void {
    if (this.espera() > 0) return;
    const vacios = { ...FILTROS_VACIOS };
    this.filtros.set(vacios);
    this.erroresCampos.set({});
    this.orden.set('desc');
    this.pagina.set(1);
    this.porPagina.set(20);
    this.busquedaDiferida = null;
    void this.sincronizarUrl(vacios, 1, 'desc', false);
    this.cargar();
  }

  private aplicarCambioFiltros(): void {
    this.pagina.set(1);
    void this.sincronizarUrl(this.filtros(), 1, this.orden(), false);
    this.cargar();
  }

  irA(destino: number): void {
    if (this.espera() > 0) return;
    const pagina = Math.max(1, Math.min(destino, this.totalPaginas()));
    if (pagina === this.pagina() && this.respuesta()) return;
    this.pagina.set(pagina);
    void this.sincronizarUrl(this.filtros(), pagina, this.orden(), false);
    this.cargar();
  }

  cambiarTamanoPagina(valor: number): void {
    if (this.espera() > 0) return;
    if (!Number.isFinite(valor) || valor === this.porPagina()) return;
    this.porPagina.set(valor);
    this.pagina.set(1);
    void this.sincronizarUrl(this.filtros(), 1, this.orden(), false);
    this.cargar();
  }

  irAPaginaValor(valor: string): void {
    if (this.espera() > 0) return;
    const destino = Number(valor);
    const maximo = this.totalPaginas();
    if (!Number.isInteger(destino) || destino < 1 || destino > maximo) {
      return;
    }
    this.irA(destino);
  }

  formatearFecha(valor: unknown): string {
    if (typeof valor !== 'string') return '';
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return valor;
    return FORMATO_FECHA.format(fecha);
  }

  actorDe(movimiento: TableRow): string {
    const nombre = typeof movimiento['usuario_historico'] === 'string' ? movimiento['usuario_historico'] : '';
    const id = movimiento['usuario_id'];
    return id === null || id === undefined ? `${nombre} · Sistema` : nombre;
  }

  abrirDetalle(fila: TableRow): void {
    const id = fila['id'];
    if (typeof id !== 'number') return;
    this.detalleId.set(id);
    this.detalleAbierto.set(true);
    this.cargarDetalle(id);
  }

  abrirDetalleDesdeBoton(event: Event, fila: TableRow): void {
    event.stopPropagation();
    this.abrirDetalle(fila);
  }

  private cargarDetalle(id: number): void {
    this.detalleSub?.unsubscribe();
    this.detalleCargando.set(true);
    this.detalle.set(null);
    this.detalleError.set(null);
    this.detalleSub = this.service.detalle(id).subscribe({
      next: (resp) => {
        this.detalle.set(resp.datos);
        this.detalleCargando.set(false);
      },
      error: (err) => {
        this.detalleError.set(err);
        this.detalleCargando.set(false);
        if (err instanceof HttpErrorResponse && err.status === 429) {
          const body = err.error as BitacoraError | null;
          const seg = body?.reintentar_en_segundos;
          if (typeof seg === 'number' && seg > 0) {
            // 429 compartido: bloquea controles del listado
            this.error.set(err);
            this.iniciarEspera(seg);
          }
        }
      },
    });
  }

  reintentarDetalle(): void {
    const id = this.detalleId();
    if (id === null || this.espera() > 0) return;
    this.cargarDetalle(id);
  }

  cerrarDetalle(): void {
    this.detalleAbierto.set(false);
    this.detalle.set(null);
    this.detalleError.set(null);
    this.detalleId.set(null);
    this.detalleSub?.unsubscribe();
  }

  recargarListadoDesdeDetalle(): void {
    this.cerrarDetalle();
    this.cargar();
  }

  iniciarSesion(): void {
    this.auth.limpiarSesionLocal();
    void this.router.navigate(['/login']);
  }

  private iniciarEspera(segundos: number): void {
    this.detenerReloj();
    this.espera.set(Math.max(0, Math.floor(segundos)));
    if (this.espera() <= 0) {
      this.liberarDiferida();
      return;
    }
    this.relojId = setInterval(() => {
      const restantes = this.espera() - 1;
      this.espera.set(Math.max(restantes, 0));
      if (restantes <= 0) {
        this.detenerReloj();
        this.liberarDiferida();
      }
    }, 1000);
  }

  private liberarDiferida(): void {
    const termino = this.busquedaDiferida;
    if (termino === null) return;
    this.busquedaDiferida = null;
    if (this.validarBuscar(termino) === null) {
      this.pagina.set(1);
      void this.sincronizarUrl(this.filtros(), 1, this.orden(), false);
      this.cargar();
    }
  }

  private detenerReloj(): void {
    if (this.relojId !== null) {
      clearInterval(this.relojId);
      this.relojId = null;
    }
  }

  private describirError(error: unknown): FallaListado | null {
    if (!error) return null;
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const body = error instanceof HttpErrorResponse ? (error.error as BitacoraError | null) : null;
    const mensajeBody = body?.mensaje ?? body?.message ?? null;
    const codigo = body?.codigo ?? null;
    const campo = body?.campo ?? null;

    switch (status) {
      case 400:
        return {
          status,
          mensaje: mensajeBody ?? 'Los parámetros de consulta no son válidos.',
          codigo,
          campo,
          accion: 'ninguna',
          segundos: null,
        };
      case 401:
        return {
          status,
          mensaje: 'Tu sesión venció. Vuelve a iniciar sesión.',
          codigo,
          campo,
          accion: 'iniciar-sesion',
          segundos: null,
        };
      case 403:
        return {
          status,
          mensaje: 'No tienes permiso para consultar la bitácora.',
          codigo: codigo ?? 'permiso_denegado',
          campo,
          accion: 'ninguna',
          segundos: null,
        };
      case 429: {
        const segundos = typeof body?.reintentar_en_segundos === 'number' ? body.reintentar_en_segundos : null;
        return {
          status,
          mensaje:
            segundos !== null
              ? `Has superado el límite de consultas. Intenta de nuevo en ${FORMATO_NUMERO.format(segundos)} segundos.`
              : (mensajeBody ?? 'Has superado el límite de consultas. Intenta de nuevo más tarde.'),
          codigo: codigo ?? 'limite_consultas',
          campo,
          accion: 'reintentar',
          segundos,
        };
      }
      case 503:
        return {
          status,
          mensaje: mensajeBody ?? 'Servicio no disponible temporalmente. Intenta más tarde.',
          codigo: codigo ?? 'servicio_no_disponible',
          campo,
          accion: 'reintentar',
          segundos: null,
        };
      default:
        return {
          status,
          mensaje:
            status === 0
              ? 'No pudimos conectar con el servidor. Revisa tu conexión.'
              : (mensajeBody ?? 'Ocurrió un error al consultar la bitácora.'),
          codigo,
          campo,
          accion: 'reintentar',
          segundos: null,
        };
    }
  }

  private describirErrorDetalle(error: unknown): FallaDetalle | null {
    if (!error) return null;
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const body = error instanceof HttpErrorResponse ? (error.error as BitacoraError | null) : null;
    const mensajeBody = body?.mensaje ?? body?.message ?? null;
    const codigo = body?.codigo ?? null;

    switch (status) {
      case 401:
        return { status, mensaje: 'Tu sesión venció. Vuelve a iniciar sesión.', codigo, accion: 'ninguna', segundos: null };
      case 403:
        return { status, mensaje: 'No tienes permiso para consultar la bitácora.', codigo: codigo ?? 'permiso_denegado', accion: 'ninguna', segundos: null };
      case 404:
        return { status, mensaje: 'El movimiento ya no existe.', codigo: codigo ?? 'no_encontrado', accion: 'recargar', segundos: null };
      case 429: {
        const segundos = typeof body?.reintentar_en_segundos === 'number' ? body.reintentar_en_segundos : null;
        return {
          status,
          mensaje:
            segundos !== null
              ? `Has superado el límite de consultas. Intenta de nuevo en ${FORMATO_NUMERO.format(segundos)} segundos.`
              : (mensajeBody ?? 'Has superado el límite de consultas.'),
          codigo: codigo ?? 'limite_consultas',
          accion: 'reintentar',
          segundos,
        };
      }
      case 503:
        return { status, mensaje: mensajeBody ?? 'Servicio no disponible temporalmente. Intenta más tarde.', codigo: codigo ?? 'servicio_no_disponible', accion: 'reintentar', segundos: null };
      default:
        return {
          status,
          mensaje:
            status === 0
              ? 'No pudimos conectar con el servidor. Revisa tu conexión.'
              : (mensajeBody ?? 'No se pudo cargar el detalle.'),
          codigo,
          accion: 'reintentar',
          segundos: null,
        };
    }
  }
}
