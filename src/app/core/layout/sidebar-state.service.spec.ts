import { TestBed } from '@angular/core/testing';
import { SidebarStateService } from './sidebar-state.service';

const STORAGE_KEY = 'utn-rh.sidebar-collapsed';

function stubMatchMedia(initial: Record<string, boolean>) {
  const listeners = new Map<string, Set<(e: MediaQueryListEvent) => void>>();
  const state = { ...initial };
  const original = window.matchMedia;

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => {
      if (!listeners.has(query)) {
        listeners.set(query, new Set());
      }
      return {
        matches: Boolean(state[query]),
        media: query,
        addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) =>
          listeners.get(query)!.add(cb),
        removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) =>
          listeners.get(query)!.delete(cb),
      } as unknown as MediaQueryList;
    },
  });

  return {
    set(next: Record<string, boolean>): void {
      for (const [query, matches] of Object.entries(next)) {
        state[query] = matches;
        listeners
          .get(query)
          ?.forEach((cb) => cb({ matches, media: query } as MediaQueryListEvent));
      }
    },
    restore(): void {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: original,
      });
    },
  };
}

describe('SidebarStateService', () => {
  const TABLET = '(min-width: 768px) and (max-width: 1023px)';
  const MOBILE = '(max-width: 767px)';

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('starts expanded', () => {
    expect(TestBed.inject(SidebarStateService).collapsed()).toBe(false);
  });

  it('toggle() flips the state both ways', () => {
    const service = TestBed.inject(SidebarStateService);

    service.toggle();
    expect(service.collapsed()).toBe(true);

    service.toggle();
    expect(service.collapsed()).toBe(false);
  });

  it('writes the state to localStorage', () => {
    const service = TestBed.inject(SidebarStateService);

    service.setCollapsed(true);
    TestBed.tick();

    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('reads a stored true back on a fresh instance', () => {
    localStorage.setItem(STORAGE_KEY, 'true');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(SidebarStateService).collapsed()).toBe(true);
  });

  it('auto-collapses on tablet via effectiveCollapsed without overwriting localStorage', () => {
    const media = stubMatchMedia({ [TABLET]: true, [MOBILE]: false });
    try {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const service = TestBed.inject(SidebarStateService);
      TestBed.tick();

      expect(service.isTablet()).toBe(true);
      expect(service.collapsed()).toBe(false);
      expect(service.effectiveCollapsed()).toBe(true);
      expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
    } finally {
      media.restore();
    }
  });

  it('expands labels inside the mobile drawer even when desktop collapsed is true, and closes mobileOpen on resize up', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const media = stubMatchMedia({ [TABLET]: false, [MOBILE]: true });
    try {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const service = TestBed.inject(SidebarStateService);

      expect(service.collapsed()).toBe(true);
      expect(service.isMobile()).toBe(true);
      expect(service.effectiveCollapsed()).toBe(false);

      service.openMobile();
      expect(service.mobileOpen()).toBe(true);

      media.set({ [MOBILE]: false, [TABLET]: true });
      TestBed.tick();

      expect(service.mobileOpen()).toBe(false);
      expect(service.effectiveCollapsed()).toBe(true);
    } finally {
      media.restore();
    }
  });
});
