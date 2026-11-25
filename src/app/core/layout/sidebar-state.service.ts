import { DestroyRef, Injectable, WritableSignal, computed, effect, inject, signal } from '@angular/core';

const STORAGE_KEY = 'utn-rh.sidebar-collapsed';
const TABLET_MEDIA_QUERY = '(min-width: 768px) and (max-width: 1023px)';
const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

/**
 * Width and responsive drawer state of the main navigation.
 *
 * The desktop collapse preference belongs to the person, not to the tab, so
 * it survives in `localStorage`. On tablet (`768px–1023px`) the sidebar
 * auto-collapses to the 76px rail via `effectiveCollapsed` without mutating
 * that stored preference; on mobile (`<= 767px`) it becomes a full-label
 * off-canvas drawer driven by `mobileOpen`.
 */
@Injectable({ providedIn: 'root' })
export class SidebarStateService {
  private readonly destroyRef = inject(DestroyRef);

  private readonly _collapsed = signal(this.readStored());
  private readonly _isTablet = signal(false);
  private readonly _isMobile = signal(false);
  private readonly _mobileOpen = signal(false);

  /** User's explicit desktop preference: `true` when collapsed to the rail. */
  readonly collapsed = this._collapsed.asReadonly();

  /** `true` when the viewport matches tablet range (`768px–1023px`). */
  readonly isTablet = this._isTablet.asReadonly();

  /** `true` when the viewport matches mobile range (`<= 767px`). */
  readonly isMobile = this._isMobile.asReadonly();

  /** `true` while the mobile off-canvas navigation drawer is open. */
  readonly mobileOpen = this._mobileOpen.asReadonly();

  /**
   * Effective rail state consumed by `AppShell` and `Sidebar`.
   * - Mobile: `false` so the off-canvas drawer always shows full labels.
   * - Tablet: `true` so the rail leaves room for main content without
   *   overwriting `localStorage`.
   * - Desktop: mirrors the stored user preference (`collapsed`).
   */
  readonly effectiveCollapsed = computed(() => {
    if (this._isMobile()) {
      return false;
    }
    if (this._isTablet()) {
      return true;
    }
    return this._collapsed();
  });

  constructor() {
    this.observeMedia(TABLET_MEDIA_QUERY, this._isTablet);
    this.observeMedia(MOBILE_MEDIA_QUERY, this._isMobile);

    effect(() => {
      const value = this._collapsed();
      try {
        localStorage.setItem(STORAGE_KEY, String(value));
      } catch {
        // Persistence is best effort; the in-memory state still works.
      }
    });

    effect(() => {
      if (!this._isMobile() && this._mobileOpen()) {
        this._mobileOpen.set(false);
      }
    });
  }

  /** Swaps between the full drawer and the icon-only rail on desktop. */
  toggle(): void {
    this._collapsed.update((collapsed) => !collapsed);
  }

  /** Sets the desktop rail state explicitly. */
  setCollapsed(value: boolean): void {
    this._collapsed.set(value);
  }

  /** Opens the mobile off-canvas navigation drawer. */
  openMobile(): void {
    if (this._isMobile()) {
      this._mobileOpen.set(true);
    }
  }

  /** Closes the mobile off-canvas navigation drawer. */
  closeMobile(): void {
    this._mobileOpen.set(false);
  }

  /** Toggles the mobile off-canvas navigation drawer. */
  toggleMobile(): void {
    if (!this._isMobile()) {
      return;
    }
    this._mobileOpen.update((open) => !open);
  }

  private observeMedia(query: string, target: WritableSignal<boolean>): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(query);
    target.set(mql.matches);
    const onChange = (event: MediaQueryListEvent) => target.set(event.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      this.destroyRef.onDestroy(() => mql.removeEventListener('change', onChange));
    } else if (typeof mql.addListener === 'function') {
      mql.addListener(onChange);
      this.destroyRef.onDestroy(() => mql.removeListener(onChange));
    }
  }

  private readStored(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }
}
