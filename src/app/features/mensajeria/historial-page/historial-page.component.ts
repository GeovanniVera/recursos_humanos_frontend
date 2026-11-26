import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { finalize, firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import {
  esRolAutorizador,
  etiquetaModo,
  fechaCorta,
  formatFileSize,
  reemplazarVariablesHtmlPreview,
  reemplazarVariablesTexto,
} from '../../../core/mensajeria/mensajeria-token.helper';
import {
  ComunicadoArchivo,
  ComunicadoConteos,
  ComunicadoDestinatarioDto,
  ComunicadoDto,
  DestinatarioComunicadoConteos,
  EstatusDestinatario,
  FiltroBandejaComunicados,
} from '../../../core/mensajeria/mensajeria.models';
import { MensajeriaService } from '../../../core/mensajeria/mensajeria.service';
import { AlertBanner } from '../../../shared/ui/alert-banner/alert-banner.component';
import { Button } from '../../../shared/ui/button/button.component';
import {
  DataTable,
  TableColumn,
  TableDensity,
  TableRow,
} from '../../../shared/ui/data-table/data-table.component';
import { Drawer } from '../../../shared/ui/drawer/drawer.component';
import { Pagination } from '../../../shared/ui/pagination/pagination.component';
import { RowFlag, RowFlagTone } from '../../../shared/ui/row-flag/row-flag.component';
import { RowLink } from '../../../shared/ui/row-link/row-link.component';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { MailPreview } from '../mail-preview/mail-preview.component';

type FiltroHistorial =
  | 'historial'
  | 'historial_completados'
  | 'historial_en_progreso'
  | 'historial_con_fallos';

type TabDetalleDrawer = 'destinatarios' | 'preview';

const COLUMNAS_HISTORIAL: readonly TableColumn[] = [
  { key: 'folio_texto', header: 'Folio', width: '132px' },
  { key: 'asunto', header: 'Asunto' },
  { key: 'remitente', header: 'Remitente' },
  { key: 'entrega_texto', header: 'Entregados', align: 'end', width: '116px' },
  { key: 'estatus_texto', header: 'Estado', width: '144px' },
  { key: 'fecha_texto', header: 'Fecha envío', width: '114px' },
];

const FILTROS_HISTORIAL: readonly { id: FiltroHistorial; label: string }[] = [
  { id: 'historial', label: 'Todos' },
  { id: 'historial_completados', label: 'Completados' },
  { id: 'historial_en_progreso', label: 'En progreso' },
  { id: 'historial_con_fallos', label: 'Con fallos' },
];

const FILTROS_DESTINATARIO: readonly { id: EstatusDestinatario | 'TODOS'; label: string }[] = [
  { id: 'TODOS', label: 'Todos' },
  { id: 'ENVIADO', label: 'Enviados' },
  { id: 'FALLIDO', label: 'Fallidos' },
  { id: 'PEND', label: 'Pendientes' },
];

const DENSIDADES: readonly { id: TableDensity; label: string }[] = [
  { id: 'compact', label: 'Compacta' },
  { id: 'standard', label: 'Estándar' },
  { id: 'comfortable', label: 'Amplia' },
];

@Component({
  selector: 'app-historial-envios-page',
  imports: [
    FormsModule,
    DataTable,
    RowFlag,
    RowLink,
    Pagination,
    Drawer,
    Button,
    AlertBanner,
    MailPreview,
  ],
  templateUrl: './historial-page.component.html',
  styleUrl: './historial-page.component.scss',
})
export class HistorialEnviosPage {
  private readonly mensajeria = inject(MensajeriaService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly columnas = COLUMNAS_HISTORIAL;
  readonly filtrosEstado = FILTROS_HISTORIAL;
  readonly filtrosDestinatario = FILTROS_DESTINATARIO;
  readonly densidades = DENSIDADES;
  readonly tamanosPagina = [10, 20, 50] as const;

  readonly esAutorizador = computed(() => esRolAutorizador(this.auth.sesion()?.rol));
  readonly estadoFiltro = signal<FiltroHistorial>('historial');
  readonly buscar = signal('');
  readonly pagina = signal(1);
  readonly porPagina = signal<number>(20);
  readonly densidad = signal<TableDensity>('standard');

  readonly cargando = signal(false);
  readonly errorCarga = signal<string | null>(null);
  readonly comunicados = signal<readonly ComunicadoDto[]>([]);
  readonly conteos = signal<ComunicadoConteos>({
    pendientes: 0,
    aprobados: 0,
    rechazados: 0,
    borradores: 0,
    historial: 0,
    historial_completados: 0,
    historial_en_progreso: 0,
    historial_con_fallos: 0,
  });
  readonly totalRegistros = signal(0);
  readonly paginaActual = signal(1);
  readonly totalPaginas = signal(1);

  readonly drawerOpen = signal(false);
  readonly drawerTab = signal<TabDetalleDrawer>('destinatarios');
  readonly seleccionado = signal<ComunicadoDto | null>(null);
  readonly cargandoDetalle = signal(false);
  readonly reintentando = signal(false);

  readonly destFiltro = signal<EstatusDestinatario | 'TODOS'>('TODOS');
  readonly destBuscar = signal('');
  readonly destPagina = signal(1);
  readonly destCargando = signal(false);
  readonly destError = signal<string | null>(null);
  readonly destinatarios = signal<readonly ComunicadoDestinatarioDto[]>([]);
  readonly destConteos = signal<DestinatarioComunicadoConteos>({
    total: 0,
    pendientes: 0,
    enviados: 0,
    fallidos: 0,
  });
  readonly destTotal = signal(0);
  readonly destTotalPaginas = signal(1);

  private readonly embeddedObjectUrls = new Map<number, string>();
  private readonly imageUrlsVersion = signal(0);
  private timerBusqueda: ReturnType<typeof setTimeout> | null = null;
  private timerBuscarDest: ReturnType<typeof setTimeout> | null = null;

  readonly filas = computed<readonly TableRow[]>(() =>
    this.comunicados().map((c) => {
      const fallidosTxt = c.fallidos > 0 ? ` · ${c.fallidos} err.` : '';
      return {
        id: c.id,
        folio_texto: c.folio ?? `ID-${c.id}`,
        asunto: c.asunto,
        remitente: c.autor.nombre,
        entrega_texto: `${c.enviados} / ${c.total_destinatarios}${fallidosTxt}`,
        estatus_texto: c.status_etiqueta,
        fecha_texto: fechaCorta(c.fecha_completado ?? c.fecha_resolucion ?? c.fecha_creacion),
        _raw: c,
      };
    }),
  );

  readonly rango = computed(() => {
    const total = this.totalRegistros();
    if (total === 0) {
      return 'Sin registros';
    }
    const inicio = (this.paginaActual() - 1) * this.porPagina() + 1;
    const fin = Math.min(this.paginaActual() * this.porPagina(), total);
    return `${inicio}-${fin} de ${total}`;
  });

  readonly etiquetaPagina = computed(() => `Página ${this.paginaActual()} de ${this.totalPaginas()}`);

  readonly previewSubject = computed(() => {
    const c = this.seleccionado();
    return c ? reemplazarVariablesTexto(c.asunto, {}) : '';
  });

  readonly previewBodySafe = computed<SafeHtml>(() => {
    const c = this.seleccionado();
    this.imageUrlsVersion();
    if (!c) {
      return '';
    }
    const html = reemplazarVariablesHtmlPreview(c.contenido_html, {}, this.embeddedObjectUrls);
    return this.sanitizer.bypassSecurityTrustHtml(html);
  });

  readonly porcentajeExito = computed(() => {
    const c = this.seleccionado();
    if (!c || c.total_destinatarios <= 0) {
      return 0;
    }
    return Math.min(100, Math.round((c.enviados / c.total_destinatarios) * 100));
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.timerBusqueda !== null) {
        clearTimeout(this.timerBusqueda);
      }
      if (this.timerBuscarDest !== null) {
        clearTimeout(this.timerBuscarDest);
      }
      this.limpiarUrlsEmbebidas();
    });
    this.solicitar();
  }

  solicitar(): void {
    this.cargando.set(true);
    this.errorCarga.set(null);

    this.mensajeria
      .listarComunicados(
        this.estadoFiltro() as FiltroBandejaComunicados,
        this.pagina(),
        this.buscar(),
        this.porPagina(),
      )
      .pipe(finalize(() => this.cargando.set(false)))
      .subscribe({
        next: (res) => {
          this.comunicados.set(res.comunicados);
          this.conteos.set(res.conteos);
          this.totalRegistros.set(res.meta.total);
          this.paginaActual.set(res.meta.current_page);
          this.totalPaginas.set(res.meta.last_page);
        },
        error: () => {
          this.errorCarga.set('No se pudo cargar el historial de envíos.');
        },
      });
  }

  contadorDe(filtro: FiltroHistorial): number {
    const c = this.conteos();
    switch (filtro) {
      case 'historial':
        return c.historial ?? 0;
      case 'historial_completados':
        return c.historial_completados ?? 0;
      case 'historial_en_progreso':
        return c.historial_en_progreso ?? 0;
      case 'historial_con_fallos':
        return c.historial_con_fallos ?? 0;
    }
  }

  filtrarEstado(filtro: FiltroHistorial): void {
    this.estadoFiltro.set(filtro);
    this.pagina.set(1);
    this.solicitar();
  }

  alBuscar(valor: string): void {
    this.buscar.set(valor);
    if (this.timerBusqueda !== null) {
      clearTimeout(this.timerBusqueda);
    }
    this.timerBusqueda = setTimeout(() => {
      this.pagina.set(1);
      this.solicitar();
    }, 250);
  }

  irA(nuevaPagina: number): void {
    this.pagina.set(nuevaPagina);
    this.solicitar();
  }

  irAPaginaValor(valor: string): void {
    const num = Number.parseInt(valor, 10);
    if (Number.isFinite(num) && num >= 1 && num <= this.totalPaginas()) {
      this.irA(num);
    }
  }

  cambiarTamanoPagina(tam: number): void {
    this.porPagina.set(tam);
    this.pagina.set(1);
    this.solicitar();
  }

  tonoDe(row: TableRow): RowFlagTone {
    const raw = row['_raw'] as ComunicadoDto | undefined;
    switch (raw?.status) {
      case 'COMPLET':
        return 'completo';
      case 'FALLIDO':
        return 'baja';
      case 'EN_COLA':
      case 'ENVIANDO':
      case 'ENVIADO_PARCIAL':
      default:
        return 'casi_completo';
    }
  }

  tonoDestinatario(status: EstatusDestinatario): 'completo' | 'casi_completo' | 'baja' {
    switch (status) {
      case 'ENVIADO':
        return 'completo';
      case 'FALLIDO':
        return 'baja';
      default:
        return 'casi_completo';
    }
  }

  abrirDesdeEnlace(event: Event, row: TableRow): void {
    event.stopPropagation();
    this.abrirDrawer(row);
  }

  abrirDrawer(row: TableRow): void {
    const raw = row['_raw'] as ComunicadoDto | undefined;
    if (!raw) {
      return;
    }

    this.limpiarUrlsEmbebidas();
    this.seleccionado.set(raw);
    this.drawerTab.set('destinatarios');
    this.destFiltro.set(raw.fallidos > 0 ? 'FALLIDO' : 'TODOS');
    this.destBuscar.set('');
    this.destPagina.set(1);
    this.drawerOpen.set(true);

    void this.cargarImagenesEmbebidas(raw);
    this.cargarDestinatarios();
  }

  refrescarDetalle(): void {
    const actual = this.seleccionado();
    if (!actual) {
      return;
    }

    this.cargandoDetalle.set(true);
    this.mensajeria
      .obtenerComunicado(actual.id)
      .pipe(finalize(() => this.cargandoDetalle.set(false)))
      .subscribe({
        next: (res) => {
          this.seleccionado.set(res.comunicado);
          void this.cargarImagenesEmbebidas(res.comunicado);
          this.cargarDestinatarios();
          this.solicitar();
        },
        error: () => {
          this.toast.show({ type: 'error', title: 'No se pudo actualizar el detalle del envío.' });
        },
      });
  }

  cargarDestinatarios(): void {
    const actual = this.seleccionado();
    if (!actual) {
      return;
    }

    const filtro = this.destFiltro();
    this.destCargando.set(true);
    this.destError.set(null);

    this.mensajeria
      .listarDestinatariosComunicado(
        actual.id,
        filtro === 'TODOS' ? null : filtro,
        this.destPagina(),
        this.destBuscar(),
        25,
      )
      .pipe(finalize(() => this.destCargando.set(false)))
      .subscribe({
        next: (res) => {
          this.destinatarios.set(res.destinatarios);
          this.destConteos.set(res.conteos);
          this.destTotal.set(res.meta.total);
          this.destTotalPaginas.set(res.meta.last_page);
        },
        error: () => {
          this.destError.set('No se pudo cargar el detalle de destinatarios.');
        },
      });
  }

  filtrarDestinatarios(status: EstatusDestinatario | 'TODOS'): void {
    this.destFiltro.set(status);
    this.destPagina.set(1);
    this.cargarDestinatarios();
  }

  alBuscarDestinatario(valor: string): void {
    this.destBuscar.set(valor);
    if (this.timerBuscarDest !== null) {
      clearTimeout(this.timerBuscarDest);
    }
    this.timerBuscarDest = setTimeout(() => {
      this.destPagina.set(1);
      this.cargarDestinatarios();
    }, 250);
  }

  irAPaginaDest(pagina: number): void {
    if (pagina < 1 || pagina > this.destTotalPaginas()) {
      return;
    }
    this.destPagina.set(pagina);
    this.cargarDestinatarios();
  }

  contadorDestinatario(id: EstatusDestinatario | 'TODOS'): number {
    const c = this.destConteos();
    switch (id) {
      case 'TODOS':
        return c.total;
      case 'ENVIADO':
        return c.enviados;
      case 'FALLIDO':
        return c.fallidos;
      case 'PEND':
        return c.pendientes;
    }
  }

  puedeReintentar(item: ComunicadoDto): boolean {
    return (
      this.esAutorizador() &&
      (item.status === 'FALLIDO' || item.status === 'ENVIADO_PARCIAL') &&
      item.fallidos > 0
    );
  }

  reintentarFallidos(item: ComunicadoDto): void {
    this.reintentando.set(true);
    this.mensajeria
      .reintentarFallidos(item.id)
      .pipe(finalize(() => this.reintentando.set(false)))
      .subscribe({
        next: (res) => {
          this.toast.show({ type: 'success', title: res.mensaje });
          this.seleccionado.set(res.comunicado);
          this.destFiltro.set('TODOS');
          this.destPagina.set(1);
          this.cargarDestinatarios();
          this.solicitar();
        },
        error: (err: unknown) => {
          const msg =
            err instanceof HttpErrorResponse && err.error?.message
              ? String(err.error.message)
              : 'No se pudo encolar el reintento.';
          this.toast.show({ type: 'error', title: msg });
        },
      });
  }

  archivoExpirado(archivo: ComunicadoArchivo): boolean {
    return archivo.estado === 'ELIMINADO' || archivo.esta_disponible === false;
  }

  async descargarArchivo(comunicadoId: number, archivo: ComunicadoArchivo): Promise<void> {
    if (this.archivoExpirado(archivo)) {
      this.toast.show({
        type: 'info',
        title: 'Esta imagen expiró y fue eliminada del servidor tras cumplir su vigencia.',
      });
      return;
    }

    try {
      const blob = await firstValueFrom(this.mensajeria.descargarAdjunto(comunicadoId, archivo.id));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = archivo.nombre_original;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      this.toast.show({ type: 'error', title: 'No se pudo descargar el archivo.' });
    }
  }

  modoTexto(item: ComunicadoDto): string {
    return etiquetaModo(item.modo_destinatarios);
  }

  fechaHoraTexto(iso: string | null): string {
    if (!iso) {
      return '—';
    }
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      return '—';
    }
    return d.toLocaleString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatBytes(bytes: number): string {
    return formatFileSize(bytes);
  }

  irARedactar(): void {
    this.mensajeria.solicitarNuevoCorreo();
    void this.router.navigate(['/mensajeria']);
  }

  private async cargarImagenesEmbebidas(item: ComunicadoDto): Promise<void> {
    const embebidas = (item.archivos ?? []).filter(
      (a) => a.embebido_en_cuerpo && a.es_imagen && !this.archivoExpirado(a),
    );
    if (embebidas.length === 0) {
      return;
    }

    await Promise.all(
      embebidas.map(async (arch) => {
        if (this.embeddedObjectUrls.has(arch.id)) {
          return;
        }
        try {
          const blob = await firstValueFrom(this.mensajeria.descargarAdjunto(item.id, arch.id));
          if (this.seleccionado()?.id !== item.id) {
            return;
          }
          this.embeddedObjectUrls.set(arch.id, URL.createObjectURL(blob));
        } catch {
          // Si una imagen no se puede descargar para vista previa, se conserva el marcador original.
        }
      }),
    );

    this.imageUrlsVersion.update((v) => v + 1);
  }

  private limpiarUrlsEmbebidas(): void {
    for (const url of this.embeddedObjectUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.embeddedObjectUrls.clear();
  }
}
