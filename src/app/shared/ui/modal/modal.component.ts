import {
  Component,
  ElementRef,
  TemplateRef,
  contentChild,
  effect,
  input,
  model,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/** Instance counter, so two modals on the same screen keep distinct title ids. */
let nextDialogId = 0;

/**
 * Confirmation / form layer over the page.
 *
 * It is a native `<dialog>` opened with `showModal()` and not a styled `<div>`:
 * the top layer, the focus trap, `Escape` and the inert background are platform
 * behaviour. A hand-rolled overlay would have to reimplement all four, and would
 * get the focus trap subtly wrong.
 *
 * The `open` model is the only source of truth. The effect pushes it into the
 * element, and the native `close` event pushes back, so `<app-modal [(open)]>`
 * stays in sync however the dialog was dismissed.
 */
@Component({
  selector: 'app-modal',
  imports: [NgTemplateOutlet],
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.scss',
})
export class Modal {
  readonly title = input('');
  readonly open = model(false);
  /** When false, neither `Escape`, nor the backdrop, nor the ✕ can close it. */
  readonly dismissible = input(true);
  readonly size = input<'md' | 'lg'>('md');

  /** Wired to `aria-labelledby`: the heading carries the accessible name. */
  protected readonly titleId = `modal-title-${nextDialogId++}`;

  /** Footer content. `#actions` is projected as a template, not as markup. */
  protected readonly actions = contentChild('actions', { read: TemplateRef });

  private readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // Zoneless: the effect is scheduled by the signal itself, so setting `open`
    // from a parent is enough to open or close the layer.
    effect(() => {
      const dialog = this.dialogRef()?.nativeElement;
      if (!dialog) {
        return;
      }

      const shouldOpen = this.open();
      if (shouldOpen && !dialog.open) {
        dialog.showModal();
      } else if (!shouldOpen && dialog.open) {
        dialog.close();
      }
    });
  }

  /**
   * Asks the platform to close. `close()` fires the `close` event, and that
   * event is what clears the model — one path for every dismissal, so the
   * parent cannot end up believing the layer is still open.
   */
  protected requestClose(): void {
    const dialog = this.dialogRef()?.nativeElement;
    if (dialog?.open) {
      dialog.close();
      return;
    }
    this.open.set(false);
  }

  /** Native `close` event: the dialog is gone, whatever closed it. */
  protected onClose(): void {
    this.open.set(false);
  }

  /** `Escape` reaches the dialog as `cancel`. A pinned layer swallows it. */
  protected onCancel(event: Event): void {
    if (!this.dismissible()) {
      event.preventDefault();
    }
  }

  /**
   * The scrim is painted by the dialog element itself, so a click on it targets
   * the dialog while landing *outside* the panel box. Both conditions are
   * needed: a click on the panel's own padding also targets the dialog, and
   * that one must not close anything.
   */
  protected onBackdropClick(event: MouseEvent): void {
    if (!this.dismissible()) {
      return;
    }

    const dialog = this.dialogRef()?.nativeElement;
    if (!dialog || event.target !== dialog) {
      return;
    }

    const rect = dialog.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;

    if (!inside) {
      this.requestClose();
    }
  }
}
