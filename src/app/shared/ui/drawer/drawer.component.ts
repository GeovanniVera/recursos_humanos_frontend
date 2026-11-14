import {
  Component,
  ElementRef,
  TemplateRef,
  computed,
  contentChild,
  effect,
  input,
  model,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/** Instance counter, so two drawers on the same screen keep distinct title ids. */
let nextDialogId = 0;

/**
 * Side panel over the page: filters, a record detail, a form.
 *
 * Same contract as `Modal` and the same reason to be a native `<dialog>` opened
 * with `showModal()` — the top layer, the focus trap, `Escape` and the inert
 * background come from the platform, with no dependency to install.
 */
@Component({
  selector: 'app-drawer',
  imports: [NgTemplateOutlet],
  templateUrl: './drawer.component.html',
  styleUrl: './drawer.component.scss',
})
export class Drawer {
  readonly title = input('');
  readonly open = model(false);
  /**
   * Hands the whole panel to the caller: no header, no footer, no fill.
   *
   * A surface with a metaphor of its own — the expediente paints a desk, a
   * folder and a sheet — cannot inherit the glass chrome without being painted
   * twice, so it asks for the bare shell instead of overriding five rules from
   * the outside.
   */
  readonly bare = input(false);
  /** When false, neither `Escape`, nor the backdrop, nor the ✕ can close it. */
  readonly dismissible = input(true);
  /** Edge the panel is anchored to. */
  readonly side = input<'right' | 'left'>('right');
  /**
   * Width of the panel. A filter rail and a full record need different room, so
   * the caller picks instead of every drawer inheriting one fixed number.
   */
  readonly size = input<'sm' | 'md' | 'lg'>('sm');

  /** Wired to `aria-labelledby`: the heading carries the accessible name. */
  protected readonly titleId = `drawer-title-${nextDialogId++}`;

  /**
   * Accessible name of a bare panel.
   *
   * A bare panel renders no `<h2>`, so there is nothing for `aria-labelledby` to
   * point at: the title travels as a plain label instead.
   */
  protected readonly bareLabel = computed(() => (this.bare() ? this.title() : null));

  /** Footer content. `#actions` is projected as a template, not as markup. */
  protected readonly actions = contentChild('actions', { read: TemplateRef });

  private readonly dialogRef = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
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

  /** `close()` fires the `close` event, and that event clears the model. */
  protected requestClose(): void {
    const dialog = this.dialogRef()?.nativeElement;
    if (dialog?.open) {
      dialog.close();
      return;
    }
    this.open.set(false);
  }

  /** Native `close` event: the panel is gone, whatever closed it. */
  protected onClose(): void {
    this.open.set(false);
  }

  /** `Escape` reaches the dialog as `cancel`. A pinned panel swallows it. */
  protected onCancel(event: Event): void {
    if (!this.dismissible()) {
      event.preventDefault();
    }
  }

  /**
   * The scrim is painted by the dialog element itself, so a click on it targets
   * the dialog while landing outside the panel box. A click on the panel's own
   * padding also targets the dialog, so the coordinates decide.
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
