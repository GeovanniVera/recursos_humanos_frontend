import { Component, input } from '@angular/core';
import { EstadoExpediente } from '../../core/semaforo/semaforo.models';
import { StatusPill } from '../../shared/ui/status-pill/status-pill.component';

export const ESTADOS_EXPEDIENTE: Record<EstadoExpediente, string> = {
  completo: 'Completo',
  casi_completo: 'Casi completo',
  incompleto: 'Incompleto',
};

/**
 * State of the file with the marker that says it: a check, a dash or a bang.
 *
 * The word and the shape come from the shared `app-status-pill`; this component
 * only owns the drawing, which is the part a badge needs and a plain pill does
 * not. The icon is projected, so the pill sizes it and decides its ink.
 */
@Component({
  selector: 'app-estado-expediente',
  imports: [StatusPill],
  template: `<app-status-pill [estado]="estado()">
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
    >{{ etiquetas[estado()] }}</app-status-pill
  >`,
})
export class EstadoExpedienteBadge {
  readonly estado = input.required<EstadoExpediente>();
  protected readonly etiquetas = ESTADOS_EXPEDIENTE;
}
