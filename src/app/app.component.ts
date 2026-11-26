import { Component, inject } from '@angular/core';
import { AuthService } from './core/auth/auth.service';
import { RouterOutlet } from '@angular/router';
import { ToastContainer } from './shared/ui/toast/toast-container.component';

/**
 * Host of the application: it mounts the router and the one toast container.
 *
 * The container sits outside the outlet on purpose. A toast belongs to the app,
 * not to a screen: raising one and then navigating must not make it disappear.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainer],
  // Unmount expired views, including native modal dialogs that escape ancestor inert.
  template: '@if (!auth.expiracionPendiente()) { <router-outlet /> }\n<app-toast-container />',
})
export class App {
  readonly auth = inject(AuthService);
}
