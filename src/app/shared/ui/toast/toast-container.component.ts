import { Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { ToastService, ToastType } from './toast.service';

type PopoverElement = HTMLDivElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
};

/**
 * The visible end of `ToastService`, mounted once in `App`.
 *
 * It lives outside the routed outlet on purpose: a toast raised on one screen
 * has to survive the navigation that follows it. Using `popover="manual"`
 * promotes the stack into the browser top layer so notifications stay visible
 * above open `<dialog>` drawers and modals.
 */
@Component({
  selector: 'app-toast-container',
  templateUrl: './toast-container.component.html',
  styleUrl: './toast-container.component.scss',
})
export class ToastContainer {
  private readonly toastService = inject(ToastService);
  private readonly stackRef = viewChild<ElementRef<PopoverElement>>('stack');

  readonly toasts = this.toastService.toasts;

  constructor() {
    effect(() => {
      const items = this.toasts();
      const el = this.stackRef()?.nativeElement;
      if (!el || typeof el.showPopover !== 'function') {
        return;
      }

      try {
        if (items.length > 0) {
          if (el.matches?.(':popover-open')) {
            el.hidePopover?.();
          }
          el.showPopover();
        } else if (el.matches?.(':popover-open')) {
          el.hidePopover?.();
        }
      } catch {
        // Ignore in environments without full top-layer popover support.
      }
    });
  }

  isLeaving(id: number): boolean {
    return this.toastService.isLeaving(id);
  }

  dismiss(id: number): void {
    this.toastService.dismiss(id);
  }

  /**
   * Only `error` and `warning` interrupt: they are worth announcing
   * assertively. Success and info stay polite, inside the same live region.
   */
  role(type: ToastType): 'alert' | null {
    return type === 'error' || type === 'warning' ? 'alert' : null;
  }
}
