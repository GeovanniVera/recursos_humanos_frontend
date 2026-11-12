import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
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
    expect(links[3].textContent?.trim()).toBe('Semaforo de documentos');
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

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(host(fixture).querySelector('#submenu-empleados')).toBeNull();
    // Only the home link and the document traffic light are left: the children
    // went with the branch.
    expect(navLinks(fixture).length).toBe(2);
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
    expect(links[1].getAttribute('href')).toBe('/empleados/activos');
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
});
