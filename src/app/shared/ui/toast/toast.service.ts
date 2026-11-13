import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** The four states of the system, each with its own icon and colour. */
export type ToastType = 'success' | 'error' | 'info' | 'warning';

/** One notification already placed in the stack. */
export interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
}

/** Options of a single `show()` call. */
export interface ToastOptions {
  /**
   * Milliseconds before the toast removes itself. `0` pins it until the user
   * dismisses it, which is what a message with an action needs.
   */
  duration?: number;
}

const DEFAULT_DURATION = 5000;
/** Must stay in sync with `--motion-exit` in `tokens/_motion.scss`. */
export const TOAST_EXIT_MS = 220;
/**
 * Four cards fit in the top-right corner without covering the page header. A
 * fifth one would start pushing content around, so the oldest leaves instead.
 */
const MAX_VISIBLE = 4;

/**
 * Queue of notifications, mounted once at the root of the app.
 *
 * The collection is a signal, so the container renders from it and nothing has
 * to subscribe. Timers are kept in private maps, one per toast: a toast that is
 * dismissed by hand never leaves a `setTimeout` behind to fire against a stack
 * that no longer contains it.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly destroyRef = inject(DestroyRef);

  private readonly _toasts = signal<readonly Toast[]>([]);
  private readonly _exitingIds = signal<ReadonlySet<number>>(new Set());

  /** Read-only view of the visible stack, oldest first. */
  readonly toasts = this._toasts.asReadonly();

  /** Ids currently playing their exit animation before removal. */
  readonly exitingIds = this._exitingIds.asReadonly();

  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly exitTimers = new Map<number, ReturnType<typeof setTimeout>>();

  private nextId = 1;

  constructor() {
    // Root services live as long as the app, but a test module or an embedded
    // app can be torn down: the pending timers go with it.
    this.destroyRef.onDestroy(() => this.clearTimers());
  }

  /** Returns true while a toast is playing its exit transition. */
  isLeaving(id: number): boolean {
    return this._exitingIds().has(id);
  }

  /**
   * Adds a toast and returns its id.
   *
   * The id is the handle the caller needs to dismiss it early, so it is
   * returned rather than exposed only through the array.
   */
  show(toast: Omit<Toast, 'id'>, options?: ToastOptions): number {
    const id = this.nextId++;
    const duration = options?.duration ?? DEFAULT_DURATION;

    const current = this._toasts();
    const next = [...current, { ...toast, id }];
    const overflow = next.length - MAX_VISIBLE;
    const dropped = overflow > 0 ? next.splice(0, overflow) : [];

    this._toasts.set(next);
    if (dropped.length > 0) {
      this._exitingIds.update((exiting) => {
        const updated = new Set(exiting);
        for (const old of dropped) {
          this.clearTimer(old.id);
          this.clearExitTimer(old.id);
          updated.delete(old.id);
        }
        return updated;
      });
    }

    if (duration > 0) {
      this.timers.set(
        id,
        setTimeout(() => this.dismiss(id), duration),
      );
    }

    return id;
  }

  /** Starts the exit transition for one toast and removes it after `TOAST_EXIT_MS`. */
  dismiss(id: number): void {
    this.clearTimer(id);
    if (!this._toasts().some((toast) => toast.id === id) || this._exitingIds().has(id)) {
      return;
    }

    this._exitingIds.update((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });

    this.exitTimers.set(
      id,
      setTimeout(() => this.finalizeDismiss(id), TOAST_EXIT_MS),
    );
  }

  /** Clears the stack and every pending timer with it. */
  dismissAll(): void {
    this.clearTimers();
    this._exitingIds.set(new Set());
    this._toasts.set([]);
  }

  private finalizeDismiss(id: number): void {
    this.clearExitTimer(id);
    this._exitingIds.update((current) => {
      if (!current.has(id)) {
        return current;
      }
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    this._toasts.update((list) => list.filter((toast) => toast.id !== id));
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  private clearExitTimer(id: number): void {
    const timer = this.exitTimers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.exitTimers.delete(id);
    }
  }

  private clearTimers(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    for (const timer of this.exitTimers.values()) {
      clearTimeout(timer);
    }
    this.exitTimers.clear();
  }
}
