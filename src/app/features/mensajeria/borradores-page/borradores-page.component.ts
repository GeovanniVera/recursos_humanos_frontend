import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { etiquetaModo, fechaCorta } from '../../../core/mensajeria/mensajeria-token.helper';
import { ComunicadoDto } from '../../../core/mensajeria/mensajeria.models';
import { MensajeriaService } from '../../../core/mensajeria/mensajeria.service';
import { AlertBanner } from '../../../shared/ui/alert-banner/alert-banner.component';
import { Button } from '../../../shared/ui/button/button.component';
import {
  DataTable,
  TableColumn,
  TableDensity,
  TableRow,
} from '../../../shared/ui/data-table/data-table.component';
import { Pagination } from '../../../shared/ui/pagination/pagination.component';
import { RowFlag } from '../../../shared/ui/row-flag/row-flag.component';
import { RowLink } from '../../../shared/ui/row-link/row-link.component';
import { ToastService } from '../../../shared/ui/toast/toast.service';

const COLUMNAS_BORRADORES: readonly TableColumn[] = [
  { key: 'asunto', header: 'Asunto' },
  { key: 'segmentacion', header: 'Segmentación' },
  { key: 'total_destinatarios', header: 'Destinatarios', align: 'end' },
  { key: 'adjuntos_count', header: 'Adjuntos', align: 'end' },
  { key: 'fecha_texto', header: 'Última edición' },
];

const DENSIDADES: readonly { id: TableDensity; label: string }[] = [
  { id: 'compact', label: 'Compacta' },
  { id: 'standard', label: 'Estándar' },
  { id: 'comfortable', label: 'Amplia' },
];

@Component({
  selector: 'app-borradores-page',
  imports: [
    FormsModule,
    DataTable,
    RowFlag,
    RowLink,
    Pagination,
    Button,
    AlertBanner,
  ],
  templateUrl: './borradores-page.component.html',
  styleUrl: './borradores-page.component.scss',
})
export class BorradoresPage {
  private readonly mensajeria = inject(MensajeriaService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly columnas = COLUMNAS_BORRADORES;
  readonly densidades = DENSIDADES;
  readonly tamanosPagina = [10, 20, 50] as const;

  readonly buscar = signal('');
  readonly paginaActual = signal(1);
  readonly porPagina = signal(20);
  readonly totalRegistros = signal(0);
  readonly totalPaginas = signal(1);
  readonly densidad = signal<TableDensity>('standard');

  readonly borradores = signal<readonly ComunicadoDto[]>([]);
  readonly cargando = signal(false);
  readonly eliminandoId = signal<number | null>(null);
  readonly errorCarga = signal<string | null>(null);

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly filas = computed<readonly TableRow[]>(() =>
    this.borradores().map((item) => ({
      ...item,
      segmentacion: etiquetaModo(item.modo_destinatarios),
      adjuntos_count: item.archivos?.length ?? 0,
      fecha_texto: fechaCorta(item.fecha_creacion),
    })),
  );

  readonly rango = computed(() => {
    const total = this.totalRegistros();
    if (total === 0) {
      return 'Mostrando 0 de 0';
    }
    const inicio = (this.paginaActual() - 1) * this.porPagina() + 1;
    const fin = Math.min(total, inicio + this.borradores().length - 1);
    return `Mostrando ${inicio}–${fin} de ${total}`;
  });

  readonly etiquetaPagina = computed(
    () => `Página ${this.paginaActual()} de ${Math.max(1, this.totalPaginas())}`,
  );

  constructor() {
    this.solicitar();

    this.destroyRef.onDestroy(() => {
      if (this.searchTimer !== null) {
        clearTimeout(this.searchTimer);
      }
    });
  }

  solicitar(): void {
    this.cargando.set(true);
    this.errorCarga.set(null);

    this.mensajeria
      .listarComunicados('borradores', this.paginaActual(), this.buscar(), this.porPagina())
      .pipe(finalize(() => this.cargando.set(false)))
      .subscribe({
        next: (res) => {
          this.borradores.set(res.comunicados);
          this.totalRegistros.set(res.meta.total);
          this.totalPaginas.set(Math.max(1, res.meta.last_page));
        },
        error: (err) => {
          this.errorCarga.set(this.extraerMensaje(err, 'No se pudieron cargar tus borradores.'));
        },
      });
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

  abrirBorrador(row: TableRow): void {
    const id = Number(row['id']);
    void this.router.navigate(['/mensajeria'], { queryParams: { borrador: id } });
  }

  abrirDesdeEnlace(event: Event, row: TableRow): void {
    event.stopPropagation();
    this.abrirBorrador(row);
  }

  eliminarBorrador(event: Event, row: TableRow): void {
    event.stopPropagation();
    const id = Number(row['id']);
    this.eliminandoId.set(id);

    this.mensajeria
      .eliminarBorrador(id)
      .pipe(finalize(() => this.eliminandoId.set(null)))
      .subscribe({
        next: () => {
          this.toast.show({ type: 'success', title: 'Borrador eliminado correctamente.' });
          this.solicitar();
        },
        error: (err) => this.toast.show({
          type: 'error',
          title: this.extraerMensaje(err, 'No se pudo eliminar el borrador.'),
        }),
      });
  }

  nuevoCorreo(): void {
    void this.router.navigate(['/mensajeria']);
  }

  private extraerMensaje(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { message?: string; mensaje?: string } | null;
      return body?.mensaje || body?.message || fallback;
    }
    return fallback;
  }
}
