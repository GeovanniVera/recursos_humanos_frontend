import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  ActivatedRouteSnapshot,
  NavigationEnd,
  Router,
  RouterLink,
} from '@angular/router';
import { filter } from 'rxjs';
import { SidebarStateService } from '../../core/layout/sidebar-state.service';

/** One step of the location trail. The last one is never a link. */
export interface Crumb {
  readonly label: string;
  readonly url: string;
}

/**
 * Head of the archive index: the location trail, the drawer's shortcut note and
 * a stamped clock.
 *
 * The trail is derived from the route tree, not written by hand: every route that
 * declares `data.breadcrumb` adds a step, and its URL is rebuilt from the
 * accumulated segments. On mobile (`<= 767px`), a 44×44px menu button opens the
 * off-canvas sidebar drawer and receives focus back when the drawer closes; the
 * shortcut note is not rendered there, because the drawer is the way in and not
 * a key.
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
  private readonly sidebarState = inject(SidebarStateService);

  private readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuBtn');
  private readonly now = signal(new Date());

  readonly isMobile = this.sidebarState.isMobile;
  readonly mobileOpen = this.sidebarState.mobileOpen;

  /**
   * Whether to advertise the sidebar shortcut.
   *
   * Only on desktop: on mobile the rail is a drawer, and on tablet the collapse
   * is forced by the breakpoint and the sidebar deliberately ignores the key -
   * so between 768 and 1023 the note would be promoting a keystroke that does
   * nothing.
   */
  readonly showShortcut = computed(() => !this.isMobile() && !this.sidebarState.isTablet());

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

  private syncTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private minuteIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.scheduleClock();

    const subscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.crumbs.set(this.trailOf(this.router.routerState.snapshot.root)));

    this.destroyRef.onDestroy(() => {
      this.clearClockTimers();
      subscription.unsubscribe();
    });
  }

  private scheduleClock(): void {
    const current = new Date();
    this.now.set(current);
    const msUntilNextMinute = 60_000 - (current.getSeconds() * 1000 + current.getMilliseconds());

    this.syncTimeoutId = setTimeout(() => {
      this.syncTimeoutId = null;
      this.now.set(new Date());
      this.minuteIntervalId = setInterval(() => this.now.set(new Date()), 60_000);
    }, msUntilNextMinute);
  }

  private clearClockTimers(): void {
    if (this.syncTimeoutId !== null) {
      clearTimeout(this.syncTimeoutId);
      this.syncTimeoutId = null;
    }
    if (this.minuteIntervalId !== null) {
      clearInterval(this.minuteIntervalId);
      this.minuteIntervalId = null;
    }
  }

  toggleMobileMenu(): void {
    this.sidebarState.toggleMobile();
  }

  /** Restores keyboard focus to the mobile trigger button after drawer dismissal. */
  focusMenuButton(): void {
    this.menuButton()?.nativeElement.focus();
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
