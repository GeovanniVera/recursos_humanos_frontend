import { Component, inject } from '@angular/core';
import { ToastService, ToastType } from './toast.service';

/**
 * The visible end of `ToastService`, mounted once in `App`.
 *
 * It lives outside the routed outlet on purpose: a toast raised on one screen
 * has to survive the navigation that follows it.
 */
@Component({
  selector: 'app-toast-container',
  templateUrl: './toast-container.component.html',
  styleUrl: './toast-container.component.scss',
})
export class ToastContainer {
  private readonly toastService = inject(ToastService);

  readonly toasts = this.toastService.toasts;

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
