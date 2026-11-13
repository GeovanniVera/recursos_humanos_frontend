import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, effect, inject, input, model, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { puedeEditarEmpleado } from '../../core/auth/editar-empleado.guard';
import { EMPTY, Subject, catchError, finalize, switchMap, tap } from 'rxjs';
import { etiquetaCampoExpediente } from '../../core/empleados/expediente-campos';
import { FaltantesResponse } from '../../core/semaforo/semaforo.models';
import { SemaforoService } from '../../core/semaforo/semaforo.service';
import { AlertBanner } from '../../shared/ui/alert-banner/alert-banner.component';
import { Button } from '../../shared/ui/button/button.component';
import { Drawer } from '../../shared/ui/drawer/drawer.component';
import { EstadoExpedienteBadge } from './estado-expediente.component';

@Component({
  selector: 'app-faltantes-drawer',
  imports: [AlertBanner, Drawer, Button, EstadoExpedienteBadge],
  templateUrl: './faltantes-drawer.component.html',
  styleUrl: './faltantes-drawer.component.scss',
})
export class FaltantesDrawer {
  private readonly api = inject(SemaforoService);
  private readonly auth = inject(AuthService);
  readonly puedeEditar = () => puedeEditarEmpleado(this.auth.rol());
  editar(): void {
    const id = this.datos()?.empleado.id;
    if (id !== undefined && this.puedeEditar()) {
      this.open.set(false);
      void this.router.navigate(['/empleados', id, 'editar']);
    }
  }
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly requests = new Subject<number | null>();
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  readonly empleadoId = input<number | null>(null);
  readonly open = model(false);
  readonly datos = signal<FaltantesResponse['datos'] | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly status = signal(0);

  constructor() {
    this.destroyRef.onDestroy(() => this.clearCloseTimer());

    this.requests
      .pipe(
        switchMap((id) => {
          if (id === null) {
            this.loading.set(false);
            return EMPTY;
          }
          this.clearCloseTimer();
          this.datos.set(null);
          this.error.set(null);
          this.status.set(0);
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
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
    effect(() => {
      const isOpen = this.open();
      if (!isOpen) {
        this.requests.next(null);
        this.scheduleClearOnClose();
        return;
      }
      this.clearCloseTimer();
      this.requests.next(this.empleadoId());
    });
  }

  private clearCloseTimer(): void {
    if (this.closeTimer !== null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  private scheduleClearOnClose(): void {
    this.clearCloseTimer();
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      if (!this.open()) {
        this.datos.set(null);
        this.error.set(null);
        this.status.set(0);
      }
    }, 300);
  }

  protected etiquetaCampo(campo: { campo: string; etiqueta?: string | null }): string {
    const label = campo.etiqueta?.trim();
    return label ? label : etiquetaCampoExpediente(campo.campo);
  }

  reintentar(): void {
    if (this.open()) this.requests.next(this.empleadoId());
  }
  iniciarSesion(): void {
    this.open.set(false);
    void this.router.navigate(['/login']);
  }
}
