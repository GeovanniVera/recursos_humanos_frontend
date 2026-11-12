import { Component } from '@angular/core';
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
  template: '<router-outlet />\n<app-toast-container />',
})
export class App {}
