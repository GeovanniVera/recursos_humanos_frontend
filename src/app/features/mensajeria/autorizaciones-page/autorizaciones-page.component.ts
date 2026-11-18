import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
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
  ComunicadoDto,
  DestinatarioMuestra,
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
import { Modal } from '../../../shared/ui/modal/modal.component';
import { Pagination } from '../../../shared/ui/pagination/pagination.component';
import { RowFlag, RowFlagTone } from '../../../shared/ui/row-flag/row-flag.component';
import { RowLink } from '../../../shared/ui/row-link/row-link.component';
import { ToastService } from '../../../shared/ui/toast/toast.service';

interface FiltroTab {
  readonly id: Extract<FiltroBandejaComunicados, 'pendientes' | 'aprobados' | 'rechazados'>;
  readonly label: string;
}

const FILTROS_AUTORIZACION: readonly FiltroTab[] = [
  { id: 'pendientes', label: 'Pendientes' },
  { id: 'aprobados', label: 'Aprobadas' },
  { id: 'rechazados', label: 'Rechazadas' },
];

const COLUMNAS_AUTORIZACION: readonly TableColumn[] = [
  { key: 'folio_texto', header: 'Folio' },
  { key: 'asunto', header: 'Asunto' },
  { key: 'solicitante', header: 'Solicitante' },
  { key: 'segmentacion', header: 'Segmentación' },
  { key: 'total_destinatarios', header: 'Destinatarios', align: 'end' },
  { key: 'estatus_texto', header: 'Estado' },
  { key: 'fecha_texto', header: 'Fecha' },
];

const DENSIDADES: readonly { id: TableDensity; label: string }[] = [
  { id: 'compact', label: 'Compacta' },
  { id: 'standard', label: 'Estándar' },
  { id: 'comfortable', label: 'Amplia' },
];

@Component({
  selector: 'app-autorizaciones-page',
  imports: [
    FormsModule,
    DataTable,
    RowFlag,
    RowLink,
    Pagination,
    Button,
    Modal,
    AlertBanner,
  ],
  templateUrl: './autorizaciones-page.component.html',
  styleUrl: './autorizaciones-page.component.scss',
})
export class AutorizacionesPage {
  private readonly mensajeria = inject(MensajeriaService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly filtrosEstado = FILTROS_AUTORIZACION;
  readonly columnas = COLUMNAS_AUTORIZACION;
  readonly densidades = DENSIDADES;
  readonly tamanosPagina = [10, 20, 50] as const;

  readonly esAutorizador = computed(() => esRolAutorizador(this.auth.rol()));

  readonly estadoFiltro = signal<FiltroTab['id']>('pendientes');
  readonly buscar = signal('');
  readonly paginaActual = signal(1);
  readonly porPagina = signal(20);
  readonly totalRegistros = signal(0);
  readonly totalPaginas = signal(1);
  readonly densidad = signal<TableDensity>('standard');

  readonly comunicados = signal<readonly ComunicadoDto[]>([]);
  readonly conteos = signal<ComunicadoConteos>({
    pendientes: 0,
    aprobados: 0,
    rechazados: 0,
    borradores: 0,
  });
  readonly cargando = signal(false);
  readonly errorCarga = signal<string | null>(null);

  // Modal de vista previa y resolución
  readonly modalOpen = signal(false);
  readonly seleccionado = signal<ComunicadoDto | null>(null);
  readonly rejectFormOpen = signal(false);
  readonly rejectFeedbackText = signal('');
  readonly resolviendo = signal(false);
  readonly imagePreviewUrls = signal<ReadonlyMap<number, string>>(new Map());

  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly objectUrls: string[] = [];

  readonly filas = computed<readonly TableRow[]>(() =>
    this.comunicados().map((item) => ({
      ...item,
      folio_texto: item.folio ?? `SOL-${item.id}`,
      solicitante: item.autor.nombre,
      segmentacion: etiquetaModo(item.modo_destinatarios),
      estatus_texto: item.status_etiqueta,
      fecha_texto: fechaCorta(item.fecha_solicitud ?? item.fecha_creacion),
    })),
  );

  readonly rango = computed(() => {
    const total = this.totalRegistros();
    if (total === 0) {
      return 'Mostrando 0 de 0';
    }
    const inicio = (this.paginaActual() - 1) * this.porPagina() + 1;
    const fin = Math.min(total, inicio + this.comunicados().length - 1);
    return `Mostrando ${inicio}–${fin} de ${total}`;
  });

  readonly etiquetaPagina = computed(
    () => `Página ${this.paginaActual()} de ${Math.max(1, this.totalPaginas())}`,
  );

  readonly muestraPreview: Partial<DestinatarioMuestra> = {
    nombre_destino: 'María Elena López Hernández',
    categoria_nombre: 'Administrativos',
    area_nombre: 'Recursos Humanos',
    numero_empleado: 'EMP-1001',
    correo_destino: 'personal@utn.edu.mx',
  };

  readonly previewSubject = computed(() => {
    const item = this.seleccionado();
    return item ? reemplazarVariablesTexto(item.asunto, this.muestraPreview) : '';
  });

  readonly previewBodySafe = computed<SafeHtml>(() => {
    const item = this.seleccionado();
    if (!item) {
      return '';
    }
    const resolved = reemplazarVariablesHtmlPreview(
      item.contenido_html,
      this.muestraPreview,
      this.imagePreviewUrls(),
    );
    return this.sanitizer.bypassSecurityTrustHtml(resolved);
  });

  constructor() {
    this.solicitar();

    this.destroyRef.onDestroy(() => {
      if (this.searchTimer !== null) {
        clearTimeout(this.searchTimer);
      }
      for (const url of this.objectUrls) {
        URL.revokeObjectURL(url);
      }
    });
  }

  solicitar(): void {
    this.cargando.set(true);
    this.errorCarga.set(null);

    this.mensajeria
      .listarComunicados(
        this.estadoFiltro(),
        this.paginaActual(),
        this.buscar(),
        this.porPagina(),
      )
      .pipe(finalize(() => this.cargando.set(false)))
      .subscribe({
        next: (res) => {
          this.comunicados.set(res.comunicados);
          this.conteos.set(res.conteos);
          this.totalRegistros.set(res.meta.total);
          this.totalPaginas.set(Math.max(1, res.meta.last_page));
        },
        error: (err) => {
          const msg = this.extraerMensajeError(err, 'No se pudo cargar la bandeja de autorizaciones.');
          this.errorCarga.set(msg);
        },
      });
  }

  filtrarEstado(filtro: FiltroTab['id']): void {
    this.estadoFiltro.set(filtro);
    this.paginaActual.set(1);
    this.solicitar();
  }

  alBuscar(valor: string): void {
    this.buscar.set(valor);
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => {
      this.paginaActual.set(1);
      this.solicitar();
    }, 300);
  }

  irA(pagina: number): void {
    this.paginaActual.set(Math.max(1, Math.min(pagina, this.totalPaginas())));
    this.solicitar();
  }

  cambiarTamanoPagina(tamano: number): void {
    this.porPagina.set(tamano);
    this.paginaActual.set(1);
    this.solicitar();
  }

  irAPaginaValor(valor: string): void {
    const parsed = Number.parseInt(valor.trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > this.totalPaginas()) {
      this.toast.show({
        type: 'error',
        title: `Ingresa un número de página entre 1 y ${this.totalPaginas()}.`,
      });
      return;
    }
    this.irA(parsed);
  }

  contadorDe(filtro: FiltroTab['id']): number {
    return this.conteos()[filtro];
  }

  tonoDe(row: TableRow): RowFlagTone {
    const status = String(row['status'] ?? '');
    if (status === 'COMPLET') {
      return 'completo';
    }
    if (status === 'RECHAZADO' || status === 'FALLIDO') {
      return 'baja';
    }
    return 'casi_completo';
  }

  abrirModal(row: TableRow): void {
    const id = Number(row['id']);
    const encontrado = this.comunicados().find((c) => c.id === id);
    if (!encontrado) {
      return;
    }
    this.seleccionado.set(encontrado);
    this.rejectFormOpen.set(false);
    this.rejectFeedbackText.set('');
    this.cargarImagenes(encontrado);
    this.modalOpen.set(true);
  }

  abrirDesdeEnlace(event: Event, row: TableRow): void {
    event.stopPropagation();
    this.abrirModal(row);
  }

  aprobar(item: ComunicadoDto): void {
    this.resolviendo.set(true);
    this.mensajeria
      .aprobar(item.id)
      .pipe(finalize(() => this.resolviendo.set(false)))
      .subscribe({
        next: (res) => {
          this.modalOpen.set(false);
          this.toast.show({
            type: 'success',
            title: `Comunicado ${res.comunicado.folio ?? ''} aprobado y encolado.`,
          });
          this.solicitar();
        },
        error: (err) => this.toast.show({
          type: 'error',
          title: this.extraerMensajeError(err, 'No se pudo aprobar el comunicado.'),
        }),
      });
  }

  agregarTagRechazo(tag: string): void {
    const current = this.rejectFeedbackText().trim();
    this.rejectFeedbackText.set(current ? `${current}. ${tag}` : `${tag}: `);
  }

  confirmarRechazo(item: ComunicadoDto): void {
    const feedback = this.rejectFeedbackText().trim();
    if (feedback.length < 5) {
      this.toast.show({
        type: 'error',
        title: 'El motivo del rechazo debe tener al menos 5 caracteres.',
      });
      return;
    }

    this.resolviendo.set(true);
    this.mensajeria
      .rechazar(item.id, feedback)
      .pipe(finalize(() => this.resolviendo.set(false)))
      .subscribe({
        next: (res) => {
          this.modalOpen.set(false);
          this.toast.show({
            type: 'info',
            title: `Solicitud ${res.comunicado.folio ?? ''} rechazada con observaciones.`,
          });
          this.solicitar();
        },
        error: (err) => this.toast.show({
          type: 'error',
          title: this.extraerMensajeError(err, 'No se pudo rechazar el comunicado.'),
        }),
      });
  }

  puedeEditarRechazado(item: ComunicadoDto): boolean {
    return (
      item.status === 'RECHAZADO' &&
      item.autor.usuario_id === this.auth.sesion()?.usuario_id
    );
  }

  editarRechazado(item: ComunicadoDto): void {
    this.modalOpen.set(false);
    void this.router.navigate(['/mensajeria'], { queryParams: { borrador: item.id } });
  }

  irARedactar(): void {
    void this.router.navigate(['/mensajeria']);
  }

  descargarArchivo(comunicadoId: number, archivo: ComunicadoArchivo): void {
    this.mensajeria.descargarAdjunto(comunicadoId, archivo.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = archivo.nombre_original;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: (err) => this.toast.show({
        type: 'error',
        title: this.extraerMensajeError(err, 'No se pudo descargar el archivo.'),
      }),
    });
  }

  formatBytes(bytes: number): string {
    return formatFileSize(bytes);
  }

  modoTexto(item: ComunicadoDto): string {
    return etiquetaModo(item.modo_destinatarios);
  }

  private cargarImagenes(comunicado: ComunicadoDto): void {
    for (const archivo of comunicado.archivos ?? []) {
      if (archivo.es_imagen && !this.imagePreviewUrls().has(archivo.id)) {
        this.mensajeria.descargarAdjunto(comunicado.id, archivo.id).subscribe({
          next: (blob) => {
            const url = URL.createObjectURL(blob);
            this.objectUrls.push(url);
            this.imagePreviewUrls.update((prev) => {
              const next = new Map(prev);
              next.set(archivo.id, url);
              return next;
            });
          },
        });
      }
    }
  }

  private extraerMensajeError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { message?: string; mensaje?: string; errors?: Record<string, string[]> } | null;
      const firstValidation = body?.errors ? Object.values(body.errors)[0]?.[0] : undefined;
      return firstValidation || body?.mensaje || body?.message || fallback;
    }
    return fallback;
  }
}
