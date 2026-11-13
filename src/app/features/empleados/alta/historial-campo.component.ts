import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, of, switchMap } from 'rxjs';
import {
  CampoConHistorial,
  EditarEmpleadoService,
  HistoriaCampo,
} from '../../../core/empleados/editar.service';
import { Button } from '../../../shared/ui/button/button.component';
import { Pagination } from '../../../shared/ui/pagination/pagination.component';
import { AlertBanner } from '../../../shared/ui/alert-banner/alert-banner.component';

/**
 * Read-only list of the values a field has already had.
 *
 * It exists so the person editing sees which study levels are already on record
 * before picking one: it consumes the history and nothing else — no control, no
 * link, no way to bring a past value back. `campo` is typed as
 * `CampoConHistorial` because the endpoint only filters by those three values and
 * answers `422` to any other, so mounting this panel on `observaciones` is a
 * compile error instead of a request that can never succeed.
 *
 * The read is deferred: nothing is requested until the disclosure is opened, and
 * closing it cancels the request in flight. A `revision` bump reloads an open
 * panel, which is how a save shows its own result.
 */
@Component({
  selector: 'app-historial-campo',
  imports: [Button, Pagination, AlertBanner],
  template: `
    <details [open]="abierto()" (toggle)="alternar($event)">
      <summary [attr.aria-label]="nombreAccesible()">
        Niveles de estudios ya registrados
        @if (datos(); as r) {
          ({{ r.meta.total }})
        }
      </summary>
      @if (abierto()) {
        <div class="content" [attr.aria-busy]="cargando()">
          @if (cargando()) {
            <span
              class="skeleton-shimmer"
              role="status"
              aria-label="Consultando historial del campo"
            ></span>
          } @else if (error()) {
            <app-alert-banner variant="error" title="No se pudo consultar el historial">
              <app-button alert-actions variant="secondary" (click)="cargar(pagina())"
                >Reintentar</app-button
              >
            </app-alert-banner>
          } @else if (datos(); as r) {
            @if (r.datos.length === 0) {
              <p>Sin cambios registrados.</p>
            } @else {
              <ol>
                @for (m of r.datos; track m.id) {
                  <li>
                    <p>
                      {{ m.valor_anterior }} <span aria-hidden="true">→</span
                      ><span class="visually-hidden">cambió a</span> {{ m.valor_nuevo }}
                    </p>
                    <p class="metadata">
                      <time [attr.datetime]="m.fecha">{{ fecha(m.fecha) }}</time> —
                      {{ m.responsable }}
                    </p>
                  </li>
                }
              </ol>
            }
            @if (r.meta.total_paginas > 1) {
              <app-pagination
                mode="compact"
                [page]="pagina()"
                [totalPages]="r.meta.total_paginas"
                [rangeText]="r.meta.total + ' cambios'"
                [pageLabel]="'Página ' + pagina() + ' de ' + r.meta.total_paginas"
                [disabled]="cargando()"
                [disablePrev]="pagina() <= 1"
                [disableNext]="pagina() >= r.meta.total_paginas"
                (pageChange)="cargar($event)"
              />
            }
          }
        </div>
      }
    </details>
  `,
  styleUrl: './historial-campo.component.scss',
})
export class HistorialCampo {
  private readonly api = inject(EditarEmpleadoService);
  readonly empleadoId = input.required<number>();
  readonly campo = input.required<CampoConHistorial>();
  readonly etiqueta = input.required<string>();
  readonly revision = input(0);
  readonly abierto = signal(false);
  readonly datos = signal<HistoriaCampo | null>(null);
  readonly pagina = signal(1);
  readonly cargando = signal(false);
  readonly error = signal(false);

  /**
   * Accessible name of the disclosure.
   *
   * It names the field the history belongs to and repeats the total, because a
   * `<summary>` announces its label, not the count painted next to it.
   */
  readonly nombreAccesible = computed(() => {
    const datos = this.datos();
    return datos === null
      ? `Historial de cambios de ${this.etiqueta()}`
      : `Historial de cambios de ${this.etiqueta()} (${datos.meta.total})`;
  });

  private readonly consultas = new Subject<number | null>();
  constructor() {
    this.consultas
      .pipe(
        switchMap((p) => {
          if (p === null) {
            this.cargando.set(false);
            return EMPTY;
          }
          this.cargando.set(true);
          this.error.set(false);
          return this.api.historialCampo(this.empleadoId(), this.campo(), p).pipe(
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
      this.empleadoId();
      this.campo();
      this.revision();
      untracked(() => {
        this.consultas.next(null);
        this.datos.set(null);
        this.pagina.set(1);
        this.error.set(false);
        if (this.abierto()) this.cargar(1);
      });
    });
  }
  alternar(event: Event): void {
    const abierto = (event.target as HTMLDetailsElement).open;
    if (abierto === this.abierto()) return;
    this.abierto.set(abierto);
    if (abierto && !this.datos() && !this.cargando()) this.cargar(1);
    if (!abierto) this.consultas.next(null);
  }
  cargar(pagina: number): void {
    if (pagina < 1 || (this.datos() && pagina > this.datos()!.meta.total_paginas)) return;
    this.pagina.set(pagina);
    this.consultas.next(pagina);
  }
  fecha(valor: string): string {
    return new Date(valor).toLocaleString('es-MX');
  }
}
