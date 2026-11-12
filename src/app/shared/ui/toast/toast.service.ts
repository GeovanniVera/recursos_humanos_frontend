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
/**
 * Four cards fit in the top-right corner without covering the page header. A
 * fifth one would start pushing content around, so the oldest leaves instead.
 */
const MAX_VISIBLE = 4;

/**
 * Queue of notifications, mounted once at the root of the app.
 *
 * The collection is a signal, so the container renders from it and nothing has
 * to subscribe. Timers are kept in a private map, one per toast: a toast that is
 * dismissed by hand never leaves a `setTimeout` behind to fire against a stack
 * that no longer contains it.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly destroyRef = inject(DestroyRef);

  private readonly _toasts = signal<readonly Toast[]>([]);

  /** Read-only view of the visible stack, oldest first. */
  readonly toasts = this._toasts.asReadonly();

  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  private nextId = 1;

  constructor() {
    // Root services live as long as the app, but a test module or an embedded
    // app can be torn down: the pending timers go with it.
    this.destroyRef.onDestroy(() => this.clearTimers());
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
    for (const old of dropped) {
      this.clearTimer(old.id);
    }

    if (duration > 0) {
      this.timers.set(
        id,
        setTimeout(() => this.dismiss(id), duration),
      );
    }

    return id;
  }

  /** Removes one toast by id, whether it timed out or the user closed it. */
  dismiss(id: number): void {
    this.clearTimer(id);
    this._toasts.update((list) => list.filter((toast) => toast.id !== id));
  }

  /** Clears the stack and every pending timer with it. */
  dismissAll(): void {
    this.clearTimers();
    this._toasts.set([]);
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  private clearTimers(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
