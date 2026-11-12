import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { authInterceptor } from './core/http/auth.interceptor';
import { ThemeService } from './core/theme/theme.service';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    // The theme has to be alive from boot, not from the first screen that happens
    // to inject it. `ThemeService` is the only thing that writes `data-theme`, so
    // without this initializer every screen that does not touch it kept the
    // static attribute from index.html and the stored choice looked lost.
    provideAppInitializer(() => {
      inject(ThemeService);
    }),
  ],
};
