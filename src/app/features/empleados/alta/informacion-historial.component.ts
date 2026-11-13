import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, switchMap, catchError, of } from 'rxjs';
import { EditarEmpleadoService, HistoriaInformacion } from '../../../core/empleados/editar.service';
import {
  DataTable,
  TableColumn,
  TableRow,
} from '../../../shared/ui/data-table/data-table.component';
import { Pagination } from '../../../shared/ui/pagination/pagination.component';
import { AlertBanner } from '../../../shared/ui/alert-banner/alert-banner.component';
import { Button } from '../../../shared/ui/button/button.component';

const ETIQUETAS: Record<string, string> = {
  nivel_estudios: 'Nivel de estudios',
  escuela_procedencia: 'Escuela',
  generacion: 'Generación',
  exp_publico_anios: 'Experiencia pública (años)',
  exp_privado_anios: 'Experiencia privada (años)',
  trabaja_otro_lugar: 'Trabaja en otro lugar',
  trabaja_otro_donde: 'Dónde trabaja',
  observaciones: 'Observaciones',
};

@Component({
  selector: 'app-informacion-historial',
  imports: [DataTable, Pagination, AlertBanner, Button],
  template: `
    <h2>Historial de Estudios y Experiencia</h2>
    @if (error()) {
      <app-alert-banner variant="error" title="No se pudo cargar el historial">
        <p>Revisa tu conexión y vuelve a intentarlo.</p>
        <app-button alert-actions variant="secondary" (click)="cargar(pagina())"
          >Reintentar</app-button
        >
      </app-alert-banner>
    }
    <app-data-table
      [columns]="columnas"
      [rows]="filas()"
      [loading]="cargando()"
      rowKey="id"
      mobileMode="cards"
      caption="Historial de Estudios y Experiencia"
      emptyMessage="Todavía no hay cambios registrados."
    />
    @if (datos(); as r) {
      <app-pagination
        [page]="pagina()"
        [totalPages]="r.meta.total_paginas"
        [pageSize]="10"
        [pageSizeOptions]="[10]"
        [disabled]="cargando()"
        [disableFirst]="pagina() <= 1"
        [disablePrev]="pagina() <= 1"
        [disableNext]="pagina() >= r.meta.total_paginas"
        [disableLast]="pagina() >= r.meta.total_paginas"
        [rangeText]="r.meta.total + ' movimientos'"
        [pageLabel]="'Página ' + pagina() + ' de ' + r.meta.total_paginas"
        (pageChange)="cargar($event)"
        (jumpSubmit)="saltar($event)"
      />
    }
  `,
})
export class InformacionHistorial {
  private readonly api = inject(EditarEmpleadoService);
  readonly empleadoId = input.required<number>();
  readonly revision = input(0);
  private readonly consultas = new Subject<{ id: number; pagina: number }>();
  readonly pagina = signal(1);
  readonly datos = signal<HistoriaInformacion | null>(null);
  readonly cargando = signal(false);
  readonly error = signal(false);
  readonly columnas: readonly TableColumn[] = [
    { key: 'fecha', header: 'Fecha' },
    { key: 'seccion', header: 'Tipo de información' },
    { key: 'antes', header: 'Información anterior' },
    { key: 'despues', header: 'Información nueva' },
    { key: 'responsable', header: 'Responsable' },
  ];
  readonly filas = computed<TableRow[]>(() =>
    (this.datos()?.datos ?? []).map((m) => ({
      ...m,
      fecha: new Date(m.fecha).toLocaleString('es-MX'),
      seccion: m.seccion === 'estudios' ? 'Estudios' : 'Experiencia',
      antes: this.texto(m.antes),
      despues: this.texto(m.despues),
    })),
  );
  constructor() {
    this.consultas
      .pipe(
        switchMap((q) => {
          this.cargando.set(true);
          this.error.set(false);
          return this.api.historial(q.id, q.pagina).pipe(
            catchError(() => {
              this.error.set(true);
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((r) => {
        this.datos.set(r);
        this.cargando.set(false);
      });
    effect(() => {
      const id = this.empleadoId();
      this.revision();
      this.pagina.set(1);
      this.consultas.next({ id, pagina: 1 });
    });
  }
  cargar(pagina: number) {
    if (pagina < 1 || pagina > (this.datos()?.meta.total_paginas ?? 1)) return;
    this.pagina.set(pagina);
    this.consultas.next({ id: this.empleadoId(), pagina });
  }
  saltar(valor: string) {
    if (/^\d+$/.test(valor)) this.cargar(Number(valor));
  }
  private texto(datos: Record<string, string | number | null>): string {
    return Object.entries(ETIQUETAS)
      .filter(([k]) => k in datos)
      .map(([k, etiqueta]) => `${etiqueta}: ${datos[k] ?? 'Sin dato'}`)
      .join('; ');
  }
}
