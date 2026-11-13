import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SidebarStateService } from '../../core/layout/sidebar-state.service';
import { Sidebar } from './sidebar.component';

function host(fixture: ComponentFixture<Sidebar>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function toggleButton(fixture: ComponentFixture<Sidebar>): HTMLButtonElement {
  const button = host(fixture).querySelector<HTMLButtonElement>('.toggle');
  if (button === null) {
    throw new Error('No collapse toggle rendered');
  }
  return button;
}

/** Every entry of the navigation tree, in document order. */
function navLinks(fixture: ComponentFixture<Sidebar>): HTMLAnchorElement[] {
  return Array.from(host(fixture).querySelectorAll<HTMLAnchorElement>('nav a'));
}

/** The `Empleados` branch toggle. It is a button: it opens, it does not navigate. */
function branchToggle(fixture: ComponentFixture<Sidebar>): HTMLButtonElement {
  const button = host(fixture).querySelector<HTMLButtonElement>('nav button');
  if (button === null) {
    throw new Error('No branch toggle rendered');
  }
  return button;
}

function footer(fixture: ComponentFixture<Sidebar>): HTMLElement {
  const element = host(fixture).querySelector<HTMLElement>('footer');
  if (element === null) {
    throw new Error('No footer rendered');
  }
  return element;
}

async function createSidebar(): Promise<ComponentFixture<Sidebar>> {
  const fixture = TestBed.createComponent(Sidebar);
  await fixture.whenStable();
  return fixture;
}

describe('Sidebar', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Sidebar],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('renders the branch and the two destinations of the expanded drawer', async () => {
    const fixture = await createSidebar();
    const links = navLinks(fixture);

    expect(links.length).toBe(4);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/empleados/activos',
      '/empleados/baja',
      '/semaforo-documentos',
    ]);
    expect(links[0].textContent).toContain('Dashboard');
    expect(links[1].textContent).toContain('Empleados Activos');
    expect(links[2].textContent).toContain('Empleados Baja');
    // The product owner's spelling, verbatim: no accent on `Semaforo`.
    expect(links[3].textContent?.trim()).toBe('Semáforo de documentos');
  });

  it('opens the Empleados branch by default and collapses it on demand', async () => {
    const fixture = await createSidebar();
    const toggle = branchToggle(fixture);

    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('type')).toBe('button');
    expect(toggle.textContent).toContain('Empleados');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe('submenu-empleados');
    expect(host(fixture).querySelector('#submenu-empleados')).not.toBeNull();

    toggle.click();
    await fixture.whenStable();

    const submenu = host(fixture).querySelector<HTMLElement>('#submenu-empleados');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(submenu).not.toBeNull();
    expect(submenu?.classList.contains('is-open')).toBe(false);
    expect(submenu?.hasAttribute('inert')).toBe(true);
    expect(submenu?.getAttribute('aria-hidden')).toBe('true');
    // Only the home link and the document traffic light remain active; children sit in the inert panel.
    expect(navLinks(fixture).filter((link) => link.closest('[inert]') === null).length).toBe(2);
  });

  it('flips aria-expanded and collapses the host when the toggle is pressed', async () => {
    const fixture = await createSidebar();
    const toggle = toggleButton(fixture);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Colapsar menú');
    // The accessible name must contain the visible word (WCAG 2.5.3).
    expect(toggle.textContent).toContain('Colapsar');
    expect(host(fixture).classList.contains('is-collapsed')).toBe(false);

    toggle.click();
    await fixture.whenStable();

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Expandir menú');
    expect(host(fixture).classList.contains('is-collapsed')).toBe(true);
  });

  it('keeps an accessible name on the rail, where a submenu cannot fit', async () => {
    const fixture = await createSidebar();
    TestBed.inject(SidebarStateService).setCollapsed(true);
    await fixture.whenStable();

    const links = navLinks(fixture);
    // Home, plus the branch folded into its landing link: 76px cannot nest a list.
    expect(links.length).toBe(3);
    expect(links[0].getAttribute('href')).toBe('/');
    expect(links[1].getAttribute('href')).toBe('/empleados');
    expect(links[1].getAttribute('aria-label')).toBe('Empleados');
    expect(links[1].getAttribute('title')).toBe('Empleados');
    expect(host(fixture).querySelector('#submenu-empleados')).toBeNull();
    // The caption block leaves the accessibility tree with the labels.
    expect(host(fixture).querySelector('app-brand-logos')).toBeNull();
  });

  it('pins Ajustes and Cerrar Sesión in a footer detached from the menu', async () => {
    const fixture = await createSidebar();
    const panel = footer(fixture);

    const settings = panel.querySelector<HTMLAnchorElement>('a[href="/ajustes"]');
    expect(settings?.textContent).toContain('Ajustes');

    const logout = panel.querySelector<HTMLButtonElement>('button');
    expect(logout?.tagName).toBe('BUTTON');
    expect(logout?.textContent).toContain('Cerrar Sesión');
    // Logging out is an action, not a destination: no link points at /login.
    expect(panel.querySelector('a[href="/login"]')).toBeNull();
    expect(panel.querySelector('nav')).toBeNull();
  });

  it('offers the catalogs to every session, above the settings', async () => {
    const fixture = await createSidebar();
    const auth = TestBed.inject(AuthService);

    /** Loads a session with one role, the way the shell does on entry. */
    async function conRol(rol: string): Promise<void> {
      auth.cargarSesion().subscribe();
      httpMock
        .expectOne((candidate) => candidate.url.endsWith('/auth/sesion'))
        .flush({ usuario_id: 1, empleado_id: 9, nombre: 'Ana Martínez', rol });
      await fixture.whenStable();
    }

    // The entry is not gated: the module was impossible to find, and the backend
    // is the one that refuses a role without `E-13`. The screen explains the 403.
    const entrada = host(fixture).querySelector<HTMLAnchorElement>('a[href="/admin/catalogos"]');
    expect(entrada?.textContent).toContain('Catálogos');

    // It stays on screen whatever the role is, including the one without E-13.
    await conRol('SECRETARIA');
    expect(host(fixture).querySelector('a[href="/admin/catalogos"]')).not.toBeNull();

    await conRol('SUPER_ADMIN');
    expect(host(fixture).querySelector('a[href="/admin/catalogos"]')).not.toBeNull();

    // It sits in the footer, above the settings, away from the daily menu.
    const destinos = Array.from(footer(fixture).querySelectorAll('a')).map((link) =>
      link.getAttribute('href'),
    );
    expect(destinos).toEqual(['/admin/catalogos', '/ajustes']);

    // The rail keeps an accessible name, since the label leaves the tree.
    TestBed.inject(SidebarStateService).setCollapsed(true);
    await fixture.whenStable();

    const rail = host(fixture).querySelector<HTMLAnchorElement>('a[href="/admin/catalogos"]');
    expect(rail?.getAttribute('aria-label')).toBe('Catálogos');
    expect(rail?.getAttribute('title')).toBe('Catálogos');
  });

  it('leaves for the login screen even when the logout request fails', async () => {
    const fixture = await createSidebar();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const logout = footer(fixture).querySelector<HTMLButtonElement>('button');
    logout?.click();
    await fixture.whenStable();

    const request = httpMock.expectOne((candidate) =>
      candidate.url.endsWith('/auth/logout'),
    );
    expect(request.request.method).toBe('POST');
    // The backend never answers: `finalize` still has to move the user out.
    request.error(new ProgressEvent('error'), { status: 0 });
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('falls back to the placeholder identity when no session is loaded', async () => {
    const fixture = await createSidebar();

    expect(host(fixture).textContent).toContain('Nombre Apellido');
    expect(host(fixture).textContent).toContain('Administrador');
    expect(host(fixture).querySelector('.avatar')?.textContent?.trim()).toBe('NA');
  });

  it('renders the decorative pill indicator inside nav and footer with aria-hidden', async () => {
    const fixture = await createSidebar();
    const navPill = host(fixture).querySelector<HTMLElement>('nav .pill-indicator');
    const footerPill = host(fixture).querySelector<HTMLElement>('footer .pill-indicator.is-footer');

    expect(navPill).not.toBeNull();
    expect(navPill?.getAttribute('aria-hidden')).toBe('true');
    expect(footerPill).not.toBeNull();
    expect(footerPill?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows accessible rail tooltips on hover and keyboard focus only when collapsed on non-mobile', async () => {
    const fixture = await createSidebar();
    const state = TestBed.inject(SidebarStateService);
    state.setCollapsed(true);
    await fixture.whenStable();

    const catalogos = host(fixture).querySelector<HTMLAnchorElement>('a[href="/admin/catalogos"]');
    expect(catalogos).not.toBeNull();

    // Hover in 76px rail mode displays a host-level role="tooltip" linked via aria-describedby.
    catalogos?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await fixture.whenStable();

    const tooltip = host(fixture).querySelector<HTMLElement>('.rail-tooltip[role="tooltip"]');
    expect(tooltip?.textContent?.trim()).toBe('Catálogos');
    expect(catalogos?.getAttribute('aria-describedby')).toBe('sidebar-rail-tooltip');

    // Escape dismisses the tooltip cleanly.
    host(fixture).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(host(fixture).querySelector('.rail-tooltip')).toBeNull();
    expect(catalogos?.getAttribute('aria-describedby')).toBeNull();

    // Keyboard focus-visible displays tooltip too.
    if (catalogos) {
      vi.spyOn(catalogos, 'matches').mockReturnValue(true);
      catalogos.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      await fixture.whenStable();
      expect(host(fixture).querySelector('.rail-tooltip')?.textContent?.trim()).toBe('Catálogos');
    }

    // Expanding the sidebar clears the tooltip immediately.
    state.setCollapsed(false);
    await fixture.whenStable();
    expect(host(fixture).querySelector('.rail-tooltip')).toBeNull();
  });

  it('auto-collapses to /empleados rail on tablet without desktop toggle and closes on mobile link click', async () => {
    const original = window.matchMedia;
    let mode: 'tablet' | 'mobile' = 'tablet';
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) =>
        ({
          matches:
            (mode === 'tablet' && query === '(min-width: 768px) and (max-width: 1023px)') ||
            (mode === 'mobile' && query === '(max-width: 767px)'),
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    });

    try {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [Sidebar],
        providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
      }).compileComponents();

      const tabletFixture = await createSidebar();
      expect(host(tabletFixture).classList.contains('is-collapsed')).toBe(true);
      expect(host(tabletFixture).querySelector('.toggle')).toBeNull();
      expect(navLinks(tabletFixture)[1].getAttribute('href')).toBe('/empleados');
      expect(localStorage.getItem('utn-rh.sidebar-collapsed')).toBe('false');

      mode = 'mobile';
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [Sidebar],
        providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
      }).compileComponents();

      const state = TestBed.inject(SidebarStateService);
      state.openMobile();
      const mobileFixture = await createSidebar();

      expect(host(mobileFixture).classList.contains('is-collapsed')).toBe(false);
      expect(host(mobileFixture).querySelector('.mobile-close')).not.toBeNull();

      navLinks(mobileFixture)[0].click();
      await mobileFixture.whenStable();
      expect(state.mobileOpen()).toBe(false);
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: original,
      });
    }
  });
});
