import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, finalize, of, switchMap, tap, timer } from 'rxjs';
import {
  ConsultaSemaforo,
  EstadoExpediente,
  OrdenSemaforo,
  SemaforoResponse,
} from '../../core/semaforo/semaforo.models';
import { SemaforoService } from '../../core/semaforo/semaforo.service';
import { Button } from '../../shared/ui/button/button.component';
import { DataTable, TableColumn, TableRow } from '../../shared/ui/data-table/data-table.component';
import { ESTADOS_EXPEDIENTE } from './estado-expediente.component';
import { FaltantesDrawer } from './faltantes-drawer.component';

@Component({
  selector: 'app-semaforo-page',
  imports: [RouterLink, Button, DataTable, FaltantesDrawer],
  templateUrl: './semaforo-page.component.html',
  styleUrl: './semaforo-page.component.scss',
})
export class SemaforoPage {
  private readonly api = inject(SemaforoService);
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
  readonly tamanos = [10, 25, 50, 100];
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
  readonly rango = computed(() => {
    const meta = this.respuesta()?.meta;
    if (this.loading()) return 'Consultando expedientes…';
    if (!meta || meta.total === 0) return 'Sin resultados';
    const inicio = (meta.pagina - 1) * meta.por_pagina + 1;
    return `Mostrando ${inicio} a ${Math.min(inicio + meta.por_pagina - 1, meta.total)} de ${meta.total} expedientes`;
  });

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
  tamano(event: Event): void {
    const n = Number((event.target as HTMLSelectElement).value);
    if (!this.tamanos.includes(n)) return;
    this.porPagina.set(n);
    this.pagina.set(1);
    this.solicitar();
  }
  irA(n: number): void {
    if (this.loading() || n < 1 || n > (this.respuesta()?.meta.total_paginas ?? 1)) return;
    this.pagina.set(n);
    this.solicitar();
  }
  abrir(row: TableRow): void {
    this.empleadoId.set(Number(row['id']));
    this.drawerOpen.set(true);
  }
  iniciarSesion(): void {
    void this.router.navigate(['/login']);
  }
}
