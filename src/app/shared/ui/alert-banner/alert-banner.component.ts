import { Component, computed, input } from '@angular/core';

/** Visual severity and icon of the banner. */
export type AlertVariant = 'error' | 'warning' | 'info' | 'success';

/** ARIA live-region role override. */
export type AlertRole = 'alert' | 'status';

/**
 * Glass status banner of the design system.
 *
 * Uses a tinted disc and glyph alongside `var(--color-surface-glass)` rather than
 * a solid state fill so projected action buttons keep full contrast across all
 * themes. Errors and warnings default to `role="alert"`, while info and success
 * banners default to `role="status"`.
 */
@Component({
  selector: 'app-alert-banner',
  templateUrl: './alert-banner.component.html',
  styleUrl: './alert-banner.component.scss',
})
export class AlertBanner {
  readonly variant = input<AlertVariant>('error');
  readonly role = input<AlertRole | null>(null);
  readonly title = input<string | null>(null);
  readonly message = input<string | null>(null);
  readonly messages = input<readonly string[]>([]);
  readonly code = input<string | null>(null);
  readonly detail = input<string | null>(null);

  protected readonly resolvedRole = computed<AlertRole>(() => {
    const explicit = this.role();
    if (explicit !== null) {
      return explicit;
    }
    const v = this.variant();
    return v === 'error' || v === 'warning' ? 'alert' : 'status';
  });

  protected readonly alertClass = computed(() => `alert is-${this.variant()}`);
}
