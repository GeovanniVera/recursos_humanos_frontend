import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SidebarStateService } from '../../core/layout/sidebar-state.service';
import { Sidebar } from './sidebar.component';

/**
 * Stand-in for every destination. The drawer only links, so a wildcard route is
 * enough to let a click finish a real navigation — which is what closes the rail
 * popover and the mobile drawer.
 */
@Component({ selector: 'app-test-playground', template: '' })
class Playground {}

const ROUTES = [{ path: '**', component: Playground }];

interface DialogPrototypePatch {
  showModal: () => void;
  close: () => void;
}

/**
 * jsdom ships `HTMLDialogElement` without `showModal` / `close`, and the card's
 * confirmation is a real `<dialog>`. The stub mirrors the platform closely
 * enough for the drawer: opening reflects the `open` attribute, closing removes
 * it and fires the `close` event the modal component listens to.
 */
function patchDialogPrototype(): void {
  const proto = HTMLDialogElement.prototype as unknown as DialogPrototypePatch;

  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };

  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

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

/** Every destination of the navigation tree, in document order. */
function navAnchors(fixture: ComponentFixture<Sidebar>): HTMLAnchorElement[] {
  return Array.from(host(fixture).querySelectorAll<HTMLAnchorElement>('#sidebar-nav a'));
}

/** The `Empleados` branch control: a button, it opens, it does not navigate. */
function branchToggle(fixture: ComponentFixture<Sidebar>): HTMLButtonElement {
  const button = host(fixture).querySelector<HTMLButtonElement>('#sidebar-nav button.is-branch');
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

/** The exit of the credential card, in either width. */
function signOutButton(fixture: ComponentFixture<Sidebar>): HTMLButtonElement {
  const button = footer(fixture).querySelector<HTMLButtonElement>('.signout');
  if (button === null) {
    throw new Error('No sign-out rendered');
  }
  return button;
}

function dialogOf(fixture: ComponentFixture<Sidebar>): HTMLDialogElement {
  const dialog = host(fixture).querySelector<HTMLDialogElement>('dialog');
  if (dialog === null) {
    throw new Error('No confirmation dialog rendered');
  }
  return dialog;
}

/**
 * The buttons of the confirmation footer, in order: `[Cancelar, Cerrar sesión]`.
 *
 * `.button` and not `.footer button`: a descendant selector also matches an
 * ancestor *outside* the query root, and the card lives inside the drawer's own
 * `<footer class="footer">`. The class of the shared button is exact enough.
 */
function dialogActions(fixture: ComponentFixture<Sidebar>): HTMLButtonElement[] {
  return Array.from(dialogOf(fixture).querySelectorAll<HTMLButtonElement>('button.button'));
}

/** Lets the drawer's own zero-delay timers (focus, geometry) run. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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
    patchDialogPrototype();
    await TestBed.configureTestingModule({
      imports: [Sidebar],
      providers: [provideRouter(ROUTES), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('renders the branch and every destination of the expanded drawer', async () => {
    const fixture = await createSidebar();
    const links = navAnchors(fixture);

    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/empleados/activos',
      '/empleados/baja',
      '/semaforo-documentos',
      '/admin/catalogos',
      '/ajustes',
    ]);
    expect(links[0].textContent).toContain('Dashboard');
    expect(links[1].textContent).toContain('Empleados Activos');
    expect(links[2].textContent).toContain('Empleados Baja');
    // The product owner's spelling, verbatim: no accent on `Semaforo`.
    expect(links[3].textContent?.trim()).toBe('Semáforo de documentos');
  });

  it('names the two groups of the archive and labels each list with its section', async () => {
    const fixture = await createSidebar();
    const labels = Array.from(host(fixture).querySelectorAll<HTMLElement>('.section-label'));
    const lists = Array.from(host(fixture).querySelectorAll<HTMLElement>('#sidebar-nav ul.list'));

    expect(labels.map((label) => label.textContent?.trim())).toEqual(['Operación', 'Sistema']);
    expect(lists.length).toBe(2);
    expect(lists[0].getAttribute('aria-labelledby')).toBe('sidebar-section-operacion');
    expect(lists[1].getAttribute('aria-labelledby')).toBe('sidebar-section-sistema');

    // `Sistema` is the configuration drawer and sinks to the foot of the sheet.
    const sistema = host(fixture).querySelector<HTMLElement>('.section.is-system');
    expect(sistema).not.toBeNull();
    expect(Array.from(sistema!.querySelectorAll('a')).map((link) => link.getAttribute('href'))).toEqual(
      ['/admin/catalogos', '/ajustes'],
    );
  });

  it('drops the section labels in the rail and leaves their dashed rule behind', async () => {
    const fixture = await createSidebar();
    TestBed.inject(SidebarStateService).setCollapsed(true);
    await fixture.whenStable();

    expect(host(fixture).querySelectorAll('.section-label').length).toBe(0);
    // One rule per group keeps the two drawers told apart without a label.
    expect(host(fixture).querySelectorAll('.section-rule').length).toBe(2);
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
    // The branch, the dashboard, the traffic light and the system entries stay reachable.
    expect(navAnchors(fixture).filter((link) => link.closest('[inert]') === null).length).toBe(4);
  });

  it('hangs the children of a branch from a dashed guide, only while the branch is open', async () => {
    const fixture = await createSidebar();
    const guide = host(fixture).querySelector<HTMLElement>('#submenu-empleados .sublist');

    expect(guide).not.toBeNull();
    expect(guide?.closest('#submenu-empleados')).not.toBeNull();
    // The children are lighter than their branch and carry no icon of their own.
    expect(guide?.querySelectorAll('.item.is-child').length).toBe(2);

    // Folded into the rail, the branch nests nothing: no guide exists at all.
    TestBed.inject(SidebarStateService).setCollapsed(true);
    await fixture.whenStable();
    expect(host(fixture).querySelector('.sublist')).toBeNull();
  });

  it('flips aria-expanded and collapses the host when the floating toggle is pressed', async () => {
    const fixture = await createSidebar();
    const toggle = toggleButton(fixture);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe('sidebar-nav');
    expect(toggle.getAttribute('aria-label')).toBe('Colapsar menú');
    expect(host(fixture).classList.contains('is-collapsed')).toBe(false);

    toggle.click();
    await fixture.whenStable();

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Expandir menú');
    expect(host(fixture).classList.contains('is-collapsed')).toBe(true);

    // And the name comes back with the labels.
    toggle.click();
    await fixture.whenStable();
    expect(toggle.getAttribute('aria-label')).toBe('Colapsar menú');
  });

  it('toggles with Ctrl+B and Cmd+B, and leaves the letter alone while someone types', async () => {
    const fixture = await createSidebar();
    const state = TestBed.inject(SidebarStateService);
    const press = (target: EventTarget, init: KeyboardEventInit) =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true, ...init }));

    press(document, { ctrlKey: true });
    await fixture.whenStable();
    expect(state.collapsed()).toBe(true);

    press(document, { metaKey: true });
    await fixture.whenStable();
    expect(state.collapsed()).toBe(false);

    // Inside a field the keystroke belongs to the person, not to the drawer.
    for (const element of [
      document.createElement('input'),
      document.createElement('textarea'),
      document.createElement('select'),
    ]) {
      host(fixture).appendChild(element);
      press(element, { ctrlKey: true });
      await fixture.whenStable();
      expect(state.collapsed()).toBe(false);
      element.remove();
    }

    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    host(fixture).appendChild(editable);
    press(editable, { ctrlKey: true });
    await fixture.whenStable();
    expect(state.collapsed()).toBe(false);
    editable.remove();
  });

  it('keeps the emblem centred on the rail instead of an empty header', async () => {
    const fixture = await createSidebar();
    // Expanded: the two marks and the caption of the lockup.
    expect(host(fixture).querySelectorAll('app-brand-logos .slot').length).toBe(2);
    expect(host(fixture).querySelector('app-brand-logos .caption')).not.toBeNull();

    TestBed.inject(SidebarStateService).setCollapsed(true);
    await fixture.whenStable();

    // Rail: one square emblem, no wordmark, no caption.
    expect(host(fixture).querySelectorAll('app-brand-logos .slot').length).toBe(1);
    expect(host(fixture).querySelector('app-brand-logos .caption')).toBeNull();
  });

  it('keeps an accessible name on the rail, where the branch opens a popover', async () => {
    const fixture = await createSidebar();
    TestBed.inject(SidebarStateService).setCollapsed(true);
    await fixture.whenStable();

    const links = navAnchors(fixture);
    // Home, the traffic light and the two system entries: the branch is a
    // button, because 76px cannot nest a list.
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/semaforo-documentos',
      '/admin/catalogos',
      '/ajustes',
    ]);

    const branch = branchToggle(fixture);
    expect(branch.getAttribute('aria-label')).toBe('Empleados');
    expect(branch.getAttribute('title')).toBe('Empleados');
    expect(branch.getAttribute('aria-expanded')).toBe('false');
    expect(host(fixture).querySelector('#submenu-empleados')).toBeNull();
  });

  it('opens the branch popover next to the rail, lists the children, and closes on Escape and on navigation', async () => {
    const fixture = await createSidebar();
    TestBed.inject(SidebarStateService).setCollapsed(true);
    await fixture.whenStable();

    const branch = branchToggle(fixture);
    branch.click();
    await settle();

    const popover = host(fixture).querySelector<HTMLElement>('#rail-submenu-empleados');
    expect(popover).not.toBeNull();
    expect(branch.getAttribute('aria-expanded')).toBe('true');
    expect(branch.getAttribute('aria-controls')).toBe('rail-submenu-empleados');
    expect(popover?.getAttribute('role')).toBe('group');
    expect(popover?.getAttribute('aria-label')).toBe('Empleados');
    expect(
      Array.from(popover!.querySelectorAll('a')).map((link) => link.getAttribute('href')),
    ).toEqual(['/empleados/activos', '/empleados/baja']);
    // The keyboard lands on the first child, so the popover is reachable without a mouse.
    expect(popover!.querySelector('a')).toBe(document.activeElement);

    // Escape closes it and hands the focus back to the button that opened it.
    host(fixture).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(host(fixture).querySelector('#rail-submenu-empleados')).toBeNull();
    expect(branch.getAttribute('aria-expanded')).toBe('false');

    // Navigating away closes it too.
    branch.click();
    await settle();
    host(fixture)
      .querySelector<HTMLAnchorElement>('#rail-submenu-empleados a')
      ?.click();
    await fixture.whenStable();
    expect(host(fixture).querySelector('#rail-submenu-empleados')).toBeNull();
  });

  it('dismisses the branch popover on an outside pointerdown', async () => {
    const fixture = await createSidebar();
    TestBed.inject(SidebarStateService).setCollapsed(true);
    await fixture.whenStable();

    branchToggle(fixture).click();
    await settle();
    expect(host(fixture).querySelector('#rail-submenu-empleados')).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await fixture.whenStable();
    expect(host(fixture).querySelector('#rail-submenu-empleados')).toBeNull();
  });

  it('closes the credential card over the footer, with the readable role and the exit', async () => {
    const fixture = await createSidebar();
    const panel = footer(fixture);

    // The card is not another destination: no navigation inside the footer.
    expect(panel.querySelector('nav')).toBeNull();
    expect(panel.querySelector('.card')).not.toBeNull();
    expect(panel.textContent).toContain('Nombre Apellido');
    expect(panel.querySelector('.role-stamp')?.textContent?.trim()).toBe('Administrador');

    expect(signOutButton(fixture).textContent).toContain('Cerrar sesión');
    // Logging out is an action, not a destination: no link points at /login.
    expect(panel.querySelector('a[href="/login"]')).toBeNull();
  });

  it('offers the catalogs to every session, in the system group', async () => {
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

    await conRol('SECRETARIA');
    expect(host(fixture).querySelector('a[href="/admin/catalogos"]')).not.toBeNull();

    await conRol('SUPER_ADMIN');
    expect(host(fixture).querySelector('a[href="/admin/catalogos"]')).not.toBeNull();

    // The rail keeps an accessible name, since the label leaves the tree.
    TestBed.inject(SidebarStateService).setCollapsed(true);
    await fixture.whenStable();

    const rail = host(fixture).querySelector<HTMLAnchorElement>('a[href="/admin/catalogos"]');
    expect(rail?.getAttribute('aria-label')).toBe('Catálogos');
    expect(rail?.getAttribute('title')).toBe('Catálogos');
  });

  it('renders the role code as its readable label, and falls back for an unknown one', async () => {
    const fixture = await createSidebar();
    const auth = TestBed.inject(AuthService);

    async function stampFor(rol: string): Promise<string> {
      auth.cargarSesion().subscribe();
      httpMock
        .expectOne((candidate) => candidate.url.endsWith('/auth/sesion'))
        .flush({ usuario_id: 1, empleado_id: 9, nombre: 'Ana Martínez', rol });
      await fixture.whenStable();
      return host(fixture).querySelector('.role-stamp')?.textContent?.trim() ?? '';
    }

    expect(await stampFor('SUPER_ADMIN')).toBe('Super Administrador');
    expect(await stampFor('ADMIN')).toBe('Administrador');
    expect(await stampFor('SISTEMAS')).toBe('Sistemas');
    expect(await stampFor('SECRETARIA')).toBe('Secretaría');
    expect(await stampFor('SECRETARIA_CIRCULARES')).toBe('Secretaría de Circulares');
    // A code the map does not know is still read as words, never as a wire value.
    expect(await stampFor('auditor_externo')).toBe('Auditor Externo');
  });

  it('asks for confirmation before closing the session, and only then calls the service', async () => {
    const fixture = await createSidebar();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    expect(dialogOf(fixture).hasAttribute('open')).toBe(false);

    signOutButton(fixture).click();
    await fixture.whenStable();

    // The layer names the person and nothing has left yet.
    const dialog = dialogOf(fixture);
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.textContent).toContain('Vas a cerrar la sesión de');
    expect(dialog.textContent).toContain('Nombre Apellido');
    httpMock.expectNone((candidate) => candidate.url.endsWith('/auth/logout'));
    expect(navigate).not.toHaveBeenCalled();

    // `Cancelar` leaves the session alone.
    dialogActions(fixture)[0].click();
    await fixture.whenStable();
    expect(dialogOf(fixture).hasAttribute('open')).toBe(false);
    httpMock.expectNone((candidate) => candidate.url.endsWith('/auth/logout'));
    expect(navigate).not.toHaveBeenCalled();

    // The confirmation is the only path out.
    signOutButton(fixture).click();
    await fixture.whenStable();
    dialogActions(fixture)[1].click();
    await fixture.whenStable();

    httpMock
      .expectOne((candidate) => candidate.url.endsWith('/auth/logout'))
      .flush({});
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('leaves for the login screen even when the logout request fails', async () => {
    const fixture = await createSidebar();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    signOutButton(fixture).click();
    await fixture.whenStable();
    dialogActions(fixture)[1].click();
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

  it('keeps the sign-out reachable in the rail, as an icon-only button', async () => {
    const fixture = await createSidebar();
    TestBed.inject(SidebarStateService).setCollapsed(true);
    await fixture.whenStable();

    const button = signOutButton(fixture);
    expect(button.getAttribute('aria-label')).toBe('Cerrar sesión');
    expect(button.getAttribute('title')).toBe('Cerrar sesión');
    // The name and the seal leave the rail; the avatar stays.
    expect(host(fixture).querySelector('.avatar')?.textContent?.trim()).toBe('NA');
    expect(host(fixture).querySelector('.role-stamp')).toBeNull();

    button.click();
    await fixture.whenStable();
    expect(dialogOf(fixture).hasAttribute('open')).toBe(true);
  });

  it('falls back to the placeholder identity when no session is loaded', async () => {
    const fixture = await createSidebar();

    expect(host(fixture).textContent).toContain('Nombre Apellido');
    expect(host(fixture).textContent).toContain('Administrador');
    expect(host(fixture).querySelector('.avatar')?.textContent?.trim()).toBe('NA');
  });

  it('renders one decorative pill indicator, inside the navigation', async () => {
    const fixture = await createSidebar();
    const navPill = host(fixture).querySelector<HTMLElement>('nav .pill-indicator');

    expect(navPill).not.toBeNull();
    expect(navPill?.getAttribute('aria-hidden')).toBe('true');
    // One list, one pill: the footer holds the card, not destinations.
    expect(host(fixture).querySelectorAll('.pill-indicator').length).toBe(1);
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

  it('auto-collapses to the rail on tablet without a toggle, and closes the mobile drawer on navigation', async () => {
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
        providers: [provideRouter(ROUTES), provideHttpClient(), provideHttpClientTesting()],
      }).compileComponents();

      const tabletFixture = await createSidebar();
      expect(host(tabletFixture).classList.contains('is-collapsed')).toBe(true);
      expect(host(tabletFixture).querySelector('.toggle')).toBeNull();
      // The rail folds the branch into a button that opens the popover.
      expect(branchToggle(tabletFixture).getAttribute('aria-expanded')).toBe('false');
      expect(localStorage.getItem('utn-rh.sidebar-collapsed')).toBe('false');

      mode = 'mobile';
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [Sidebar],
        providers: [provideRouter(ROUTES), provideHttpClient(), provideHttpClientTesting()],
      }).compileComponents();

      const state = TestBed.inject(SidebarStateService);
      state.openMobile();
      const mobileFixture = await createSidebar();

      expect(host(mobileFixture).classList.contains('is-collapsed')).toBe(false);
      expect(host(mobileFixture).querySelector('.mobile-close')).not.toBeNull();

      // The shortcut never folds a drawer that owns the screen.
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }),
      );
      await mobileFixture.whenStable();
      expect(state.collapsed()).toBe(false);
      expect(state.mobileOpen()).toBe(true);

      navAnchors(mobileFixture)[0].click();
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
