import { Component, inject } from '@angular/core';
import { Theme, ThemeService } from '../../../core/theme/theme.service';

/**
 * Token verification screen, reachable at `/tokens`.
 *
 * It exists to prove the three themes resolve correctly and to exercise
 * ThemeService, so it stays in the app as a QA screen for the design system.
 */
@Component({
  selector: 'app-token-preview',
  templateUrl: './token-preview.component.html',
  styleUrl: './token-preview.component.scss',
})
export class TokenPreview {
  private readonly themeService = inject(ThemeService);

  readonly theme = this.themeService.theme;
  readonly themes = this.themeService.themes;

  readonly swatches = [
    '--color-bg-canvas',
    '--color-surface-glass',
    '--color-surface-overlay',
    '--color-border-default',
    '--color-action-primary',
    '--color-action-on-primary',
    '--color-accent',
    '--color-state-error',
    '--color-state-success',
    '--color-state-info',
    '--color-state-warning',
  ];

  select(theme: Theme): void {
    this.themeService.setTheme(theme);
  }
}
