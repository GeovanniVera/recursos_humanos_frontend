import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SidebarStateService } from '../../core/layout/sidebar-state.service';
import { AppShell } from './app-shell.component';

@Component({ selector: 'app-test-page', template: '<p>Page</p>' })
class TestPage {}

describe('AppShell', () => {
  const MOBILE_QUERY = '(max-width: 767px)';
  const TABLET_QUERY = '(min-width: 768px) and (max-width: 1023px)';
  let originalMatchMedia: typeof window.matchMedia;

  function mockViewport(mode: 'desktop' | 'tablet' | 'mobile'): void {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) =>
        ({
          matches:
            (mode === 'mobile' && query === MOBILE_QUERY) ||
            (mode === 'tablet' && query === TABLET_QUERY),
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    });
  }

  async function setupShell(mode: 'desktop' | 'tablet' | 'mobile') {
    mockViewport(mode);
    await TestBed.configureTestingModule({
      imports: [AppShell],
      providers: [
        provideRouter([
          { path: '', component: TestPage },
          { path: 'empleados', component: TestPage },
          { path: 'ajustes', component: TestPage },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AppShell);
    await fixture.whenStable();
    return fixture;
  }

  beforeEach(() => {
    localStorage.clear();
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
    TestBed.resetTestingModule();
  });

  it('auto-collapses to the rail on tablet without mutating desktop localStorage preference', async () => {
    localStorage.setItem('utn-rh.sidebar-collapsed', 'false');
    const fixture = await setupShell('tablet');
    const hostEl = fixture.nativeElement as HTMLElement;

    expect(hostEl.querySelector('.shell')?.classList.contains('is-collapsed')).toBe(true);
    expect(hostEl.querySelector('app-sidebar')?.classList.contains('is-collapsed')).toBe(true);
    expect(hostEl.querySelector('app-sidebar')?.hasAttribute('inert')).toBe(false);
    expect(localStorage.getItem('utn-rh.sidebar-collapsed')).toBe('false');
  });

  it('keeps mobile drawer inert while closed and opens/closes with scrim and Escape', async () => {
    const fixture = await setupShell('mobile');
    const hostEl = fixture.nativeElement as HTMLElement;
    const sidebar = hostEl.querySelector<HTMLElement>('app-sidebar')!;
    const menuBtn = hostEl.querySelector<HTMLButtonElement>('app-topbar button.menu-btn')!;

    expect(sidebar.hasAttribute('inert')).toBe(true);
    expect(hostEl.querySelector('.scrim')).toBeNull();

    // Open via Topbar menu button
    menuBtn.click();
    await fixture.whenStable();

    expect(sidebar.hasAttribute('inert')).toBe(false);
    expect(sidebar.classList.contains('is-mobile-open')).toBe(true);
    const scrim = hostEl.querySelector<HTMLElement>('.scrim');
    expect(scrim).not.toBeNull();

    // Close via Escape and restore focus to trigger button
    const focusSpy = vi.spyOn(menuBtn, 'focus');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();

    expect(sidebar.hasAttribute('inert')).toBe(true);
    expect(hostEl.querySelector('.scrim')).toBeNull();
    expect(focusSpy).toHaveBeenCalledTimes(1);

    // Open again and close via clicking scrim
    menuBtn.click();
    await fixture.whenStable();
    hostEl.querySelector<HTMLElement>('.scrim')?.click();
    await fixture.whenStable();
    expect(sidebar.hasAttribute('inert')).toBe(true);
  });

  it('closes mobile drawer automatically on route navigation', async () => {
    const fixture = await setupShell('mobile');
    const state = TestBed.inject(SidebarStateService);
    const router = TestBed.inject(Router);

    state.openMobile();
    await fixture.whenStable();
    expect(state.mobileOpen()).toBe(true);

    await router.navigateByUrl('/ajustes');
    await fixture.whenStable();
    expect(state.mobileOpen()).toBe(false);
  });
});
