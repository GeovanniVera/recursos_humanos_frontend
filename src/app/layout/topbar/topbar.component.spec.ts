import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Topbar } from './topbar.component';

@Component({ selector: 'app-test-leaf', template: '' })
class TestLeaf {}

/**
 * Runs `body` with the viewport reported as mobile, then hands `matchMedia` back
 * to jsdom.
 *
 * `isMobile()` is read from `SidebarStateService` when the bar is built, so the
 * testing module has to be assembled inside the swapped window.
 */
async function inMobileViewport(body: () => Promise<void>): Promise<void> {
  const original = window.matchMedia;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) =>
      ({
        matches: query === '(max-width: 767px)',
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  });

  try {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [Topbar],
      providers: [provideRouter([])],
    }).compileComponents();

    await body();
  } finally {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: original,
    });
  }
}

describe('Topbar', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Topbar],
      providers: [
        provideRouter([
          {
            path: '',
            children: [
              { path: '', data: { breadcrumb: 'Panel general' }, component: TestLeaf },
              {
                path: 'semaforo-documentos',
                data: { breadcrumb: 'Semáforo de documentos' },
                component: TestLeaf,
              },
              {
                path: 'empleados',
                // Componentless branch: it only contributes a breadcrumb step.
                data: { breadcrumb: 'Empleados' },
                children: [
                  {
                    path: 'activos',
                    data: { breadcrumb: 'Empleados activos' },
                    component: TestLeaf,
                  },
                ],
              },
            ],
          },
        ]),
      ],
    }).compileComponents();
  });

  function labels(element: HTMLElement): string[] {
    return Array.from(element.querySelectorAll('.crumb')).map((crumb) =>
      (crumb.textContent ?? '').trim(),
    );
  }

  it('builds the trail from the route tree and links every ancestor', async () => {
    const fixture = TestBed.createComponent(Topbar);
    await TestBed.inject(Router).navigateByUrl('/empleados/activos');
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(labels(element)).toEqual(['Inicio', 'Empleados', 'Empleados activos']);

    const links = Array.from(element.querySelectorAll<HTMLAnchorElement>('.crumb.is-link'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/', '/empleados']);

    // The last step is the page you are on: text, never a link.
    const current = element.querySelector<HTMLElement>('.crumb.is-current');
    expect(current?.textContent?.trim()).toBe('Empleados activos');
    expect(current?.getAttribute('aria-current')).toBe('page');
  });

  it('hides the home step when it would link to the current page', async () => {
    const fixture = TestBed.createComponent(Topbar);
    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(labels(element)).toEqual(['Panel general']);
    expect(element.querySelector('.crumb.is-link')).toBeNull();
  });

  it('renders a semantic clock', async () => {
    const fixture = TestBed.createComponent(Topbar);
    await fixture.whenStable();

    const clock = (fixture.nativeElement as HTMLElement).querySelector('time');
    expect(clock?.textContent).toMatch(/\d{1,2}:\d{2}\s(AM|PM) · \p{Lu}/u);
    expect(clock?.getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('no longer offers the new-record action on desktop', async () => {
    const fixture = TestBed.createComponent(Topbar);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    // The dialog behind it never existed; the bar is navigation only on desktop.
    expect(element.querySelector('button')).toBeNull();
    expect(element.textContent).not.toContain('Nuevo');
  });

  it('renders a 44x44 mobile menu toggle when viewport is <= 767px', async () => {
    await inMobileViewport(async () => {
      const fixture = TestBed.createComponent(Topbar);
      await fixture.whenStable();
      const element = fixture.nativeElement as HTMLElement;

      const btn = element.querySelector<HTMLButtonElement>('button.menu-btn');
      expect(btn).not.toBeNull();
      expect(btn?.getAttribute('aria-controls')).toBe('app-sidebar-drawer');
      expect(btn?.getAttribute('aria-expanded')).toBe('false');
      expect(btn?.getAttribute('aria-label')).toBe('Abrir menú');

      btn?.click();
      await fixture.whenStable();

      expect(btn?.getAttribute('aria-expanded')).toBe('true');
      expect(btn?.getAttribute('aria-label')).toBe('Cerrar menú');
    });
  });

  it('prints the drawer shortcut as a note on desktop', async () => {
    const fixture = TestBed.createComponent(Topbar);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    const note = element.querySelector<HTMLElement>('.shortcut');
    expect(note?.tagName).toBe('P');
    expect(note?.textContent?.trim()).toBe('Archivero: Ctrl+B');
    // A note, not a control: the shortcut itself lives in the drawer.
    expect(element.querySelector('button')).toBeNull();
  });

  it('drops the shortcut note in mobile mode, where the drawer is the way in', async () => {
    await inMobileViewport(async () => {
      const fixture = TestBed.createComponent(Topbar);
      await fixture.whenStable();
      const element = fixture.nativeElement as HTMLElement;

      expect(element.querySelector('.shortcut')).toBeNull();
      expect(element.textContent).not.toContain('Ctrl+B');
      // The trigger is the way in, and it stays.
      expect(element.querySelector('button.menu-btn')).not.toBeNull();
    });
  });

  it('marks the current step as typed, unlike its ancestors', async () => {
    const fixture = TestBed.createComponent(Topbar);
    await TestBed.inject(Router).navigateByUrl('/empleados/activos');
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    const current = element.querySelector<HTMLElement>('.crumb.is-current');
    expect(current?.classList.contains('is-typed')).toBe(true);
    expect(current?.getAttribute('aria-current')).toBe('page');

    // Only the page you are on answers in the archive voice.
    for (const ancestor of Array.from(element.querySelectorAll('.crumb.is-link'))) {
      expect(ancestor.classList.contains('is-typed')).toBe(false);
    }
  });

  it('synchronizes the clock to the minute boundary and updates every 60s', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 10, 13, 10, 24, 45, 0));
      const fixture = TestBed.createComponent(Topbar);
      fixture.detectChanges();

      const timeEl = (): string =>
        (fixture.nativeElement as HTMLElement).querySelector('time')?.textContent?.trim() ?? '';

      expect(timeEl()).toContain('10:24 AM');

      // 14s later: still 10:24
      vi.advanceTimersByTime(14_999);
      fixture.detectChanges();
      expect(timeEl()).toContain('10:24 AM');

      // Exact boundary (+1ms -> 15_000ms total): flips to 10:25
      vi.advanceTimersByTime(1);
      fixture.detectChanges();
      expect(timeEl()).toContain('10:25 AM');

      // Next minute interval (60_000ms): flips to 10:26
      vi.advanceTimersByTime(60_000);
      fixture.detectChanges();
      expect(timeEl()).toContain('10:26 AM');
    } finally {
      vi.useRealTimers();
    }
  });
});
