import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, effect, inject, input, model, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { EMPTY, Subject, catchError, finalize, switchMap, tap } from 'rxjs';
import { FaltantesResponse } from '../../core/semaforo/semaforo.models';
import { SemaforoService } from '../../core/semaforo/semaforo.service';
import { Button } from '../../shared/ui/button/button.component';
import { Drawer } from '../../shared/ui/drawer/drawer.component';
import { EstadoExpedienteBadge } from './estado-expediente.component';

@Component({
  selector: 'app-faltantes-drawer',
  imports: [Drawer, Button, EstadoExpedienteBadge],
  templateUrl: './faltantes-drawer.component.html',
  styleUrl: './faltantes-drawer.component.scss',
})
export class FaltantesDrawer {
  private readonly api = inject(SemaforoService);
  private readonly router = inject(Router);
  private readonly requests = new Subject<number | null>();
  readonly empleadoId = input<number | null>(null);
  readonly open = model(false);
  readonly datos = signal<FaltantesResponse['datos'] | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly status = signal(0);

  constructor() {
    this.requests
      .pipe(
        switchMap((id) => {
          this.datos.set(null);
          this.error.set(null);
          this.status.set(0);
          if (id === null) {
            this.loading.set(false);
            return EMPTY;
          }
          this.loading.set(true);
          return this.api.faltantes(id).pipe(
            tap((r) => this.datos.set(r.datos)),
            catchError((e: unknown) => {
              const status = e instanceof HttpErrorResponse ? e.status : 0;
              this.status.set(status);
              this.error.set(
                status === 401
                  ? 'Tu sesión venció. Inicia sesión nuevamente.'
                  : status === 403
                    ? 'No tienes permiso para consultar los campos faltantes.'
                    : status === 404
                      ? 'El trabajador ya no está disponible para esta consulta.'
                      : 'No pudimos cargar los campos faltantes. Intenta nuevamente.',
              );
              return EMPTY;
            }),
            finalize(() => this.loading.set(false)),
          );
        }),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe();
    effect(() => this.requests.next(this.open() ? this.empleadoId() : null));
  }

  reintentar(): void {
    if (this.open()) this.requests.next(this.empleadoId());
  }
  iniciarSesion(): void {
    this.open.set(false);
    void this.router.navigate(['/login']);
  }
}
