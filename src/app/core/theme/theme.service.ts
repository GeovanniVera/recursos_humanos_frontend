import { DOCUMENT, Injectable, effect, inject, signal } from '@angular/core';

/** The three interchangeable themes. They share token names, not values. */
export type Theme = 'guinda' | 'light' | 'dark';

const STORAGE_KEY = 'utn-rh.theme';
// Light is the default: it is the legible theme under the harsh lighting of an
// office, and the other two stay one click away in `/ajustes`.
const DEFAULT_THEME: Theme = 'light';
const THEMES: readonly Theme[] = ['guinda', 'light', 'dark'];

/**
 * Applies `data-theme` on the document root and persists the choice.
 *
 * This is the only place that writes the theme attribute: components read
 * `theme()` and call `setTheme()`, never touch `document` directly.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  private readonly _theme = signal<Theme>(this.readInitialTheme());

  /** Read-only view of the active theme. */
  readonly theme = this._theme.asReadonly();

  /** Every theme, in the order the switcher should present them. */
  readonly themes = THEMES;

  constructor() {
    // Zoneless: signals schedule change detection, so a plain effect is enough
    // to keep the DOM attribute in sync with the signal.
    effect(() => {
      const theme = this._theme();
      this.document.documentElement.setAttribute('data-theme', theme);
      this.persist(theme);
    });
  }

  setTheme(theme: Theme): void {
    this._theme.set(theme);
  }

  /** Falls back to the default when the stored value is missing or unknown. */
  private readInitialTheme(): Theme {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && (THEMES as readonly string[]).includes(stored)) {
        return stored as Theme;
      }
    } catch {
      // Storage can be unavailable (private mode, blocked cookies). Not fatal.
    }
    return DEFAULT_THEME;
  }

  private persist(theme: Theme): void {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Persistence is best effort; the in-memory theme still applies.
    }
  }
}
