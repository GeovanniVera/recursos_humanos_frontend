import { Injectable, effect, signal } from '@angular/core';

const STORAGE_KEY = 'utn-rh.sidebar-collapsed';

/**
 * Width state of the main navigation drawer.
 *
 * The preference belongs to the person, not to the tab, so it survives in
 * `localStorage`. Storage access can throw (private mode, blocked cookies), so
 * every access is guarded: a failed read means "expanded", a failed write is
 * ignored, and the signal keeps driving the current view either way.
 */
@Injectable({ providedIn: 'root' })
export class SidebarStateService {
  private readonly _collapsed = signal(this.readStored());

  /** Read-only view: `true` when the drawer renders as an icon-only rail. */
  readonly collapsed = this._collapsed.asReadonly();

  constructor() {
    effect(() => {
      const value = this._collapsed();
      try {
        localStorage.setItem(STORAGE_KEY, String(value));
      } catch {
        // Persistence is best effort; the in-memory state still works.
      }
    });
  }

  /** Swaps between the full drawer and the icon-only rail. */
  toggle(): void {
    this._collapsed.update((collapsed) => !collapsed);
  }

  /** Sets the width explicitly, for callers that know the target state. */
  setCollapsed(value: boolean): void {
    this._collapsed.set(value);
  }

  private readStored(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }
}
