import { Injectable } from '@angular/core';

const STORAGE_KEY = 'utn-rh.token';

/**
 * Holds the Sanctum bearer token for the current browser session.
 *
 * `sessionStorage` is used on purpose (not `localStorage`): the token dies with
 * the tab. Storage access can throw in private mode or when cookies are
 * blocked, so every access is guarded; a failed write degrades to an in-memory
 * copy and never throws back to the caller.
 */
@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  /** Fallback used when `sessionStorage` is unavailable. */
  private memoryToken: string | null = null;

  read(): string | null {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        return stored;
      }
    } catch {
      // Storage unavailable: fall back to the in-memory copy below.
    }
    return this.memoryToken;
  }

  write(token: string): void {
    this.memoryToken = token;
    try {
      sessionStorage.setItem(STORAGE_KEY, token);
    } catch {
      // Persistence is best effort; the in-memory token still works.
    }
  }

  clear(): void {
    this.memoryToken = null;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing else to clean up when storage is unavailable.
    }
  }
}
