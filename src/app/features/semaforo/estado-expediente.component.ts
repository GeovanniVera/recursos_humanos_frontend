import { Component, input } from '@angular/core';
import { EstadoExpediente } from '../../core/semaforo/semaforo.models';

export const ESTADOS_EXPEDIENTE: Record<EstadoExpediente, string> = {
  completo: 'Completo',
  casi_completo: 'Casi completo',
  incompleto: 'Incompleto',
};

@Component({
  selector: 'app-estado-expediente',
  template: `<span class="badge is-{{ estado() }}">
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="8" />
      @if (estado() === 'completo') {
        <path d="m6 10 3 3 5-6" />
      } @else if (estado() === 'casi_completo') {
        <path d="M6 10h8" />
      } @else {
        <path d="M10 5v6m0 2v2" />
      }</svg
    >{{ etiquetas[estado()] }}</span
  >`,
  styleUrl: './estado-expediente.component.scss',
})
export class EstadoExpedienteBadge {
  readonly estado = input.required<EstadoExpediente>();
  protected readonly etiquetas = ESTADOS_EXPEDIENTE;
}
