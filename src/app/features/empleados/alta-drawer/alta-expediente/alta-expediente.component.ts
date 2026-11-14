import { Component, ElementRef, input, output, viewChildren } from '@angular/core';

/** One tab of the strip. The index is the identity; the label is what it says. */
export interface TabExpediente {
  readonly etiqueta: string;
}

/**
 * The paper shell of the alta: a desk, a manila folder with a tab strip, and the
 * sheet inside it.
 *
 * It is its own component because it is its own surface — the folder chrome, with
 * the same geometry and the same tokens as the record's — and because the form
 * written on the sheet does not fit in a 7 kB stylesheet together with it. The
 * sheet scrolls and the shell does not: the bar and the strip stay put however
 * long the form is, so everything the parent projects into this component lands
 * inside the only scroll container of the panel.
 *
 * It knows nothing about employees: it takes the labels of the strip, which one
 * is open and how many fields each one still has to fix, and reports the two
 * gestures that belong to the chrome — opening a tab, and closing the folder.
 */
@Component({
  selector: 'app-alta-expediente',
  templateUrl: './alta-expediente.component.html',
  styleUrl: './alta-expediente.component.scss',
})
export class AltaExpediente {
  /** Name of the document, at the top of the desk. */
  readonly titulo = input('Nuevo empleado');

  /** Labels of the strip, in order. */
  readonly tabs = input.required<readonly TabExpediente[]>();

  /** Index of the sheet on screen. */
  readonly activo = input.required<number>();

  /** Invalid fields of each tab, by index. `0` shows no badge. */
  readonly errores = input<readonly number[]>([]);

  /** `true` while the sheet has nothing to show yet: assistive tech is told. */
  readonly ocupado = input(false);

  /** A tab was chosen. The index is the one the strip was built with. */
  readonly seleccionar = output<number>();

  /** The way out of the folder, as a gesture of the chrome. */
  readonly cerrar = output<void>();

  /** `id` of the one panel every tab points at. */
  protected readonly panelId = 'alta-panel';

  /** `id` of the tab at an index, so the panel can be labelled by it. */
  protected readonly tabIdDe = (indice: number): string => `alta-tab-${indice}`;

  /** Buttons of the strip, for the roving focus of the arrow keys. */
  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabRef');

  /** Label of the badge of a tab, as a sentence. */
  protected etiquetaErrores(cantidad: number): string {
    return cantidad === 1 ? '1 campo con error' : `${cantidad} campos con error`;
  }

  /**
   * Arrow keys move through the strip and open the sheet they land on.
   *
   * Roving `tabindex` is what makes the strip one stop for Tab and arrows: only
   * the selected tab is reachable with Tab, and everything else is a step away.
   */
  protected alTeclear(event: KeyboardEvent): void {
    const total = this.tabs().length;
    const indiceActual = this.activo();
    let destino: number;

    switch (event.key) {
      case 'ArrowRight':
        destino = (indiceActual + 1) % total;
        break;
      case 'ArrowLeft':
        destino = (indiceActual - 1 + total) % total;
        break;
      case 'Home':
        destino = 0;
        break;
      case 'End':
        destino = total - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    this.seleccionar.emit(destino);
    this.tabButtons()[destino]?.nativeElement.focus();
  }
}
