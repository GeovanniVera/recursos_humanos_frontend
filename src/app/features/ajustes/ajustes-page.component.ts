import { Component, computed, inject } from '@angular/core';
import { Theme, ThemeService } from '../../core/theme/theme.service';

/**
 * Spanish copy for each theme id. The ids are the contract with
 * `ThemeService`; the labels are only what the screen shows.
 */
const THEME_LABELS: Record<Theme, string> = {
  guinda: 'Guinda',
  light: 'Claro',
  dark: 'Oscuro',
};

/** One line per theme so the choice is not made on a colour swatch alone. */
const THEME_HINTS: Record<Theme, string> = {
  guinda: 'Fondo guinda institucional, texto blanco y acentos dorados.',
  light: 'Fondo blanco y texto guinda profundo. El más legible con mucha luz.',
  dark: 'Fondo casi negro y acento dorado. El más descansado con poca luz.',
};

/**
 * Appearance settings, reachable at `/ajustes`.
 *
 * The screen owns no colour of its own: every value it shows is a token, and
 * the previews of the three themes are rendered by scoping the target theme
 * onto the preview element. The theme files key their declarations off
 * `[data-theme='…']`, an attribute selector that matches any element, so a
 * preview can resolve the tokens of a theme that is not the active one without
 * duplicating a single value here.
 */
@Component({
  selector: 'app-ajustes-page',
  templateUrl: './ajustes-page.component.html',
  styleUrl: './ajustes-page.component.scss',
})
export class AjustesPage {
  private readonly themeService = inject(ThemeService);

  /** Active theme. */
  readonly theme = this.themeService.theme;

  /** The three interchangeable themes, in the order they are presented. */
  readonly themes = this.themeService.themes;

  /** Visible label of the active theme, for the status line. */
  readonly activeLabel = computed(() => THEME_LABELS[this.theme()]);

  /** Applies the theme as soon as a card is pressed; there is no save step. */
  select(theme: Theme): void {
    this.themeService.setTheme(theme);
  }

  label(theme: Theme): string {
    return THEME_LABELS[theme];
  }

  hint(theme: Theme): string {
    return THEME_HINTS[theme];
  }
}
