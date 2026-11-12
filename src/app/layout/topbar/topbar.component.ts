import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  NavigationEnd,
  Router,
  RouterLink,
} from '@angular/router';
import { filter } from 'rxjs';

/** One step of the location trail. The last one is never a link. */
export interface Crumb {
  readonly label: string;
  readonly url: string;
}

/**
 * Clock, weekday and a navigable location trail.
 *
 * The trail is derived from the route tree, not written by hand: every route that
 * declares `data.breadcrumb` adds a step, and its URL is rebuilt from the
 * accumulated segments. Adding a screen therefore never means editing the bar.
 *
 * Zoneless: mutating a signal is what schedules the re-render, so a plain
 * interval is enough. Both the interval and the router subscription are cleared
 * through `DestroyRef`.
 */
@Component({
  selector: 'app-topbar',
  imports: [RouterLink],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss',
})
export class Topbar {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  private readonly now = signal(new Date());

  /** Home first, then every route that declares a breadcrumb label. */
  readonly crumbs = signal<readonly Crumb[]>(this.trailOf(this.router.routerState.snapshot.root));

  private readonly timeFormat = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  private readonly weekdayFormat = new Intl.DateTimeFormat('es-MX', { weekday: 'long' });

  /** `10:24 AM · Miércoles`. */
  readonly clock = computed(() => {
    const moment = this.now();
    const weekday = this.weekdayFormat.format(moment);
    return `${this.timeFormat.format(moment)} · ${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`;
  });

  /** Machine-readable twin of `clock`, so the `<time>` element is semantic. */
  readonly iso = computed(() => this.now().toISOString());

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 1000);
    this.destroyRef.onDestroy(() => clearInterval(timer));

    const subscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.crumbs.set(this.trailOf(this.router.routerState.snapshot.root)));

    this.destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  /** Walks the activated route tree, collecting labels and rebuilding URLs. */
  private trailOf(root: ActivatedRouteSnapshot): readonly Crumb[] {
    const steps: Crumb[] = [];
    const segments: string[] = [];
    let node: ActivatedRouteSnapshot | null = root;

    while (node !== null) {
      for (const segment of node.url) {
        segments.push(segment.path);
      }

      const label = node.data?.['breadcrumb'];
      if (typeof label === 'string') {
        steps.push({ label, url: `/${segments.join('/')}` });
      }

      node = node.firstChild;
    }

    const trail: Crumb[] = [{ label: 'Inicio', url: '/' }, ...steps];

    // On the home route both steps point at the same page, and a link to the
    // page you are already on is noise.
    if (trail.length > 1 && trail[0].url === trail[trail.length - 1].url) {
      trail.shift();
    }

    return trail;
  }
}
