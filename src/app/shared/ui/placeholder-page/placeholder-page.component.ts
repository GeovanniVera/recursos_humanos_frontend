import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';

/**
 * Generic stand-in for a screen that has not been built yet.
 *
 * The copy comes from the route `data`, so the router configuration stays the
 * single place that describes a destination: adding a placeholder never means
 * adding a component. The heading also matches the `breadcrumb` the top bar
 * reads from the same `data`.
 */
@Component({
  selector: 'app-placeholder-page',
  template: `
    <section class="placeholder">
      <h1 class="title">{{ titulo() }}</h1>
      <p class="body">{{ descripcion() }}</p>
    </section>
  `,
  styles: `
    .placeholder {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-6);
      border: var(--border-width) solid var(--color-border-default);
      border-radius: var(--radius-lg);
      background: var(--color-surface-glass);
      box-shadow: var(--shadow-sm);
    }

    .title {
      font: var(--text-title);
      color: var(--color-text-primary);
    }

    .body {
      font: var(--text-body);
      color: var(--color-text-secondary);
    }
  `,
})
export class PlaceholderPage {
  private readonly route = inject(ActivatedRoute);

  /**
   * Route data as a signal. `requireSync` is safe here: `ActivatedRoute.data`
   * is a behavior subject, so it emits the current value on subscribe and the
   * heading never renders one frame late.
   */
  private readonly data = toSignal(this.route.data, { requireSync: true });

  /** Heading of the screen, from `data.titulo`. */
  readonly titulo = computed(() => this.copy('titulo'));

  /** Supporting paragraph, from `data.descripcion`. */
  readonly descripcion = computed(() => this.copy('descripcion'));

  /** Reads a string entry of the route data, or an empty string when absent. */
  private copy(key: string): string {
    const value: unknown = this.data()[key];
    return typeof value === 'string' ? value : '';
  }
}
