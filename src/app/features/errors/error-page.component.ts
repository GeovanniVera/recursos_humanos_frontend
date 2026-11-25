import { Location } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { Button } from '../../shared/ui/button/button.component';

export type ErrorCode = '403' | '404' | '500';

interface ErrorCopy {
  code: ErrorCode;
  overline: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  secondaryLabel: string;
}

const ERROR_COPY: Record<ErrorCode, ErrorCopy> = {
  '403': {
    code: '403',
    overline: 'Error 403 · Acceso restringido',
    title: 'No tienes permisos para ver esta sección',
    description:
      'Tu cuenta no cuenta con las facultades necesarias para acceder a este recurso. Si requieres acceso, solicítalo a un administrador.',
    image: '/errors/403.png',
    imageAlt: 'Ilustración de acceso restringido (error 403)',
    secondaryLabel: 'Regresar',
  },
  '404': {
    code: '404',
    overline: 'Error 404 · Página no encontrada',
    title: 'No encontramos la ruta que buscas',
    description:
      'Es posible que la dirección haya cambiado, esté mal escrita o que el recurso ya no se encuentre disponible.',
    image: '/errors/404.png',
    imageAlt: 'Ilustración de página no encontrada (error 404)',
    secondaryLabel: 'Regresar',
  },
  '500': {
    code: '500',
    overline: 'Error 500 · Error interno',
    title: 'Ocurrió un problema en el servidor',
    description:
      'El servicio encontró una falla inesperada al procesar tu solicitud. Intenta nuevamente en unos momentos.',
    image: '/errors/500.png',
    imageAlt: 'Ilustración de error interno del servidor (error 500)',
    secondaryLabel: 'Reintentar',
  },
};

@Component({
  selector: 'app-error-page',
  imports: [Button],
  templateUrl: './error-page.component.html',
  styleUrl: './error-page.component.scss',
})
export class ErrorPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  private readonly routeCode = toSignal(
    this.route.data.pipe(map((data) => data['code'] as ErrorCode | undefined)),
    { initialValue: this.route.snapshot.data['code'] as ErrorCode | undefined },
  );

  readonly copy = computed<ErrorCopy>(() => {
    const code = this.routeCode();
    return code && code in ERROR_COPY ? ERROR_COPY[code] : ERROR_COPY['404'];
  });

  irAlPanel(): void {
    void this.router.navigate(['/']);
  }

  accionSecundaria(): void {
    if (this.copy().code === '500') {
      window.location.reload();
      return;
    }
    this.location.back();
  }
}
