import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { routes } from '../../app.routes';
import { authGuard } from '../../core/auth/auth.guard';
import { EmpleadoSemaforo, SemaforoResponse } from '../../core/semaforo/semaforo.models';
import { SemaforoPage } from './semaforo-page.component';

const URL = `${environment.apiBaseUrl}/semaforo`;
// Fixtures belong exclusively to unit tests; runtime always uses HttpClient.
const ROWS: EmpleadoSemaforo[] = [
  {
    id: 7,
    num_empleado: '1000',
    nombre: 'Ana Prueba',
    area: { id: 1, nombre: 'Área A' },
    puesto: { id: 2, nombre: 'Analista' },
    semaforo: {
      estado: 'incompleto',
      porcentaje: 78.95,
      total_campos: 19,
      campos_completos: 15,
      campos_faltantes: 4,
    },
  },
  {
    id: 8,
    num_empleado: '1001',
    nombre: 'Luis Prueba',
    area: null,
    puesto: null,
    semaforo: {
      estado: 'casi_completo',
      porcentaje: 94.74,
      total_campos: 19,
      campos_completos: 18,
      campos_faltantes: 1,
    },
  },
  {
    id: 9,
    num_empleado: '1002',
    nombre: 'Eva Prueba',
    area: null,
    puesto: null,
    semaforo: {
      estado: 'completo',
      porcentaje: 100,
      total_campos: 19,
      campos_completos: 19,
      campos_faltantes: 0,
    },
  },
];
function page(datos = ROWS): SemaforoResponse {
  return {
    datos,
    contadores: {
      total_evaluados: 127,
      completos: 12,
      casi_completos: 35,
      incompletos: 80,
    },
    meta: { pagina: 1, por_pagina: 25, total: 127, total_paginas: 6 },
    enlaces: { anterior: null, siguiente: null },
  };
}
function patchDialog(): void {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

describe('SemaforoPage', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<SemaforoPage>;
  const root = () => fixture.nativeElement as HTMLElement;
  const request = () => http.expectOne((r) => r.url === URL);
  beforeEach(async () => {
    patchDialog();
    await TestBed.configureTestingModule({
      imports: [SemaforoPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SemaforoPage);
  });
  afterEach(() => {
    vi.useRealTimers();
    http.verify();
    TestBed.resetTestingModule();
  });
  async function loaded(): Promise<void> {
    request().flush(page());
    await fixture.whenStable();
  }
  const pagerButtons = () =>
    Array.from(root().querySelectorAll<HTMLButtonElement>('.pager-controls app-button button'));
  const submitJump = async (valor: string): Promise<void> => {
    root().querySelector<HTMLInputElement>('#pagina')!.value = valor;
    root()
      .querySelector<HTMLFormElement>('.pager-jump')!
      .dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await fixture.whenStable();
  };

  it('replaces the lazy placeholder under the existing authenticated shell', async () => {
    request().flush(page());
    const shell = routes.find((r) => r.path === '');
    expect(shell?.canActivate).toContain(authGuard);
    const ruta = shell?.children?.find((r) => r.path === 'semaforo-documentos');
    expect(await (ruta?.loadComponent as () => Promise<unknown>)()).toBe(SemaforoPage);
  });
  it('requests the real contract once, initially without state filter', async () => {
    const req = request();
    expect(req.request.params.has('estado')).toBe(false);
    expect(req.request.params.get('por_pagina')).toBe('25');
    req.flush(page());
    await fixture.whenStable();
    http.expectNone((r) => r.url === URL);
  });
  it('renders exactly five headers, in order, and no mail/edit actions', async () => {
    await loaded();
    expect(
      Array.from(root().querySelectorAll('thead th')).map((e) => e.textContent?.trim()),
    ).toEqual(['No.', 'Nombre', 'Adscripción', 'Plaza', 'Campos faltantes']);
    expect(root().textContent).toContain('4 de 19');
    expect(root().textContent).toContain('Sin adscripción');
    expect(root().textContent).toContain('Sin plaza');
    expect(root().querySelectorAll('tbody button')).toHaveLength(3);
    expect(root().textContent).not.toContain('Ver faltantes');
    expect(root().textContent).not.toContain('Acciones');
    expect(root().querySelector('.row-link')?.getAttribute('aria-label')).toBe(
      'Ver campos faltantes de Ana Prueba',
    );
    expect(root().querySelector('tbody tr')?.classList.contains('is-clickable')).toBe(true);
    expect(root().textContent).not.toContain('Enviar correo');
    expect(root().textContent).not.toContain('Editar');
  });
  it('uses API counters instead of the three rows and labels all states', async () => {
    await loaded();
    expect(Array.from(root().querySelectorAll('.filter strong')).map((e) => e.textContent)).toEqual(
      ['127', '12', '35', '80'],
    );
    const flags = Array.from(root().querySelectorAll('tbody app-row-flag'));
    expect(flags.map((e) => e.querySelector('.visually-hidden')?.textContent?.trim())).toEqual([
      'Estado del expediente: Incompleto',
      'Estado del expediente: Casi completo',
      'Estado del expediente: Completo',
    ]);
    expect(
      flags.map((e) => {
        const lane = e.querySelector('.row-flag');
        return lane === null ? null : Array.from(lane.classList).find((c) => c.startsWith('is-'));
      }),
    ).toEqual(['is-incompleto', 'is-casi-completo', 'is-completo']);
    expect(root().querySelectorAll('tbody .row-flag[aria-hidden="true"]')).toHaveLength(3);
    for (const row of root().querySelectorAll('tbody tr')) expect(row.children).toHaveLength(5);
  });
  it('filters server-side, resets page and avoids duplicate selection requests', async () => {
    await loaded();
    fixture.componentInstance.pagina.set(3);
    fixture.componentInstance.filtrar('casi_completo');
    let req = request();
    expect(req.request.params.get('estado')).toBe('casi_completo');
    expect(req.request.params.get('pagina')).toBe('1');
    req.flush(page());
    fixture.componentInstance.filtrar('casi_completo');
    http.expectNone((r) => r.url === URL);
    fixture.componentInstance.filtrar(undefined);
    req = request();
    expect(req.request.params.has('estado')).toBe(false);
    req.flush(page());
  });
  it('cancels the previous HTTP response on rapid filter changes', async () => {
    const old = request();
    fixture.componentInstance.filtrar('incompleto');
    expect(old.cancelled).toBe(true);
    const current = request();
    fixture.componentInstance.filtrar('completo');
    expect(current.cancelled).toBe(true);
    request().flush(page([ROWS[2]]));
    await fixture.whenStable();
    expect(root().textContent).not.toContain('Ana Prueba');
  });
  it.each(['Ana', '1000'])(
    'debounces the backend search %s, retains state and resets page',
    async (term) => {
      await loaded();
      fixture.componentInstance.filtrar('incompleto');
      request().flush(page());
      fixture.componentInstance.pagina.set(3);
      fixture.componentInstance.alBuscar({
        target: { value: term },
      } as unknown as Event);
      http.expectNone((r) => r.url === URL);
      await new Promise((resolve) => setTimeout(resolve, 340));
      const req = request();
      expect(req.request.params.get('buscar')).toBe(term);
      expect(req.request.params.get('estado')).toBe('incompleto');
      expect(req.request.params.get('pagina')).toBe('1');
      req.flush(page());
    },
  );
  it('coalesces a pending search and immediate filter into one latest request', async () => {
    await loaded();
    fixture.componentInstance.alBuscar({
      target: { value: 'Ana' },
    } as unknown as Event);
    fixture.componentInstance.filtrar('completo');
    const req = request();
    expect(req.request.params.get('buscar')).toBe('Ana');
    req.flush(page());
    await new Promise((resolve) => setTimeout(resolve, 340));
    http.expectNone((r) => r.url === URL);
  });
  it('sorts supported headers on the server and exposes aria-sort', async () => {
    await loaded();
    const buttons = root().querySelectorAll<HTMLButtonElement>('thead button');
    expect(buttons).toHaveLength(3);
    buttons[1].click();
    const req = request();
    expect(req.request.params.get('ordenar_por')).toBe('nombre');
    expect(req.request.params.get('direccion')).toBe('asc');
    req.flush(page());
    await fixture.whenStable();
    expect(root().querySelectorAll('th')[1].getAttribute('aria-sort')).toBe('ascending');
    root().querySelectorAll<HTMLButtonElement>('thead button')[1].click();
    const next = request();
    expect(next.request.params.get('direccion')).toBe('desc');
    next.flush(page());
  });
  it('paginates with retained filters/search/order and changes page size', async () => {
    await loaded();
    fixture.componentInstance.buscar.set('Ana');
    fixture.componentInstance.estado.set('incompleto');
    fixture.componentInstance.orden.set('nombre');
    fixture.componentInstance.irA(2);
    let req = request();
    expect(req.request.params.get('pagina')).toBe('2');
    expect(req.request.params.get('buscar')).toBe('Ana');
    expect(req.request.params.get('estado')).toBe('incompleto');
    expect(req.request.params.get('ordenar_por')).toBe('nombre');
    req.flush({ ...page(), meta: { ...page().meta, pagina: 2 } });
    fixture.componentInstance.cambiarPorPagina({
      target: { value: '50' },
    } as unknown as Event);
    req = request();
    expect(req.request.params.get('pagina')).toBe('1');
    expect(req.request.params.get('por_pagina')).toBe('50');
    req.flush(page());
  });
  it('shows loading then an empty state and guards the pager', async () => {
    await fixture.whenStable();
    expect(root().querySelector('table')?.getAttribute('aria-busy')).toBe('true');
    request().flush({
      ...page([]),
      contadores: {
        total_evaluados: 0,
        completos: 0,
        casi_completos: 0,
        incompletos: 0,
      },
      meta: { pagina: 1, por_pagina: 25, total: 0, total_paginas: 1 },
    });
    await fixture.whenStable();
    expect(root().textContent).toContain('No hay expedientes que coincidan');
    expect(root().textContent).toContain('Sin resultados');
    fixture.componentInstance.irA(2);
    http.expectNone((r) => r.url === URL);
  });
  it.each([0, 401, 403, 422, 429, 500])(
    'handles HTTP %s without exposing server traces',
    async (status) => {
      const req = request();
      if (status === 0) req.error(new ProgressEvent('error'));
      else req.flush({ message: 'SQL SECRET TRACE' }, { status, statusText: 'Error' });
      await fixture.whenStable();
      expect(root().querySelector('[role="alert"]')).not.toBeNull();
      expect(root().textContent).not.toContain('SQL SECRET');
      expect(fixture.componentInstance.loading()).toBe(false);
      if (status !== 401 && status !== 403) {
        fixture.componentInstance.solicitar(false, true);
        request().flush(page());
      }
    },
  );
  it('opens the existing native drawer and fetches only the selected employee', async () => {
    await loaded();
    root().querySelector<HTMLButtonElement>('app-row-link button')?.click();
    await fixture.whenStable();
    const req = http.expectOne(`${URL}/7/faltantes`);
    req.flush({
      datos: {
        empleado: { id: 7, num_empleado: '1000', nombre: 'Ana Prueba' },
        semaforo: {
          ...ROWS[0].semaforo,
          detalle_faltantes: [{ campo: 'curp', etiqueta: 'CURP' }],
        },
      },
    });
    await fixture.whenStable();
    expect(root().querySelector('dialog')?.hasAttribute('open')).toBe(true);
    expect(root().querySelector('dialog')?.textContent).toContain('CURP');
    expect(root().querySelector('dialog')?.textContent).toContain('78.95');
    root().querySelector<HTMLButtonElement>('dialog .close')?.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.drawerOpen()).toBe(false);
  });
  it('opens the same employee from every cell without duplicate detail requests', async () => {
    await loaded();
    const cells = root().querySelectorAll<HTMLTableCellElement>('tbody tr:first-child td');
    for (const cell of cells) {
      cell.click();
      await fixture.whenStable();
      const req = http.expectOne(`${URL}/7/faltantes`);
      req.flush({
        datos: {
          empleado: { id: 7, num_empleado: '1000', nombre: 'Ana Prueba' },
          semaforo: { ...ROWS[0].semaforo, detalle_faltantes: [] },
        },
      });
      await fixture.whenStable();
      fixture.componentInstance.drawerOpen.set(false);
      await fixture.whenStable();
    }
  });
  it('keeps the initial selector in sync with the requested page size', async () => {
    await loaded();
    expect(root().querySelector<HTMLSelectElement>('#porPagina')?.value).toBe('25');
  });
  it('returns to page one if the last remaining results disappear', async () => {
    await loaded();
    fixture.componentInstance.irA(3);
    request().flush({
      ...page([]),
      meta: { pagina: 3, por_pagina: 25, total: 0, total_paginas: 1 },
    });
    const req = request();
    expect(req.request.params.get('pagina')).toBe('1');
    expect(fixture.componentInstance.loading()).toBe(true);
    req.flush({ ...page([]), meta: { pagina: 1, por_pagina: 25, total: 0, total_paginas: 1 } });
    await fixture.whenStable();
    expect(fixture.componentInstance.loading()).toBe(false);
  });
  it('keeps the pager out of the screen until a response arrives', async () => {
    await fixture.whenStable();
    expect(root().querySelector('footer.pager')).toBeNull();
    request().flush(page());
    await fixture.whenStable();
    expect(root().querySelector('footer.pager')).not.toBeNull();
    expect(root().querySelector('#porPagina')).not.toBeNull();
    expect(root().textContent).toContain('Mostrando 1 a 25 de 127 expedientes');
    expect(root().querySelector('.pager-page')?.textContent?.trim()).toBe('Página 1 de 6');
  });
  it('hides the pager when the request fails', async () => {
    request().flush({ message: 'SQL SECRET TRACE' }, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(root().querySelector('footer.pager')).toBeNull();
  });
  it('navigates to the last and first page from the footer buttons', async () => {
    await loaded();
    const [primera, anterior, siguiente, ultima] = pagerButtons();
    expect(primera.disabled).toBe(true);
    expect(anterior.disabled).toBe(true);
    expect(siguiente.disabled).toBe(false);
    expect(ultima.disabled).toBe(false);

    ultima.click();
    let req = request();
    expect(req.request.params.get('pagina')).toBe('6');
    req.flush({ ...page(), meta: { ...page().meta, pagina: 6 } });
    await fixture.whenStable();

    expect(root().querySelector('.pager-page')?.textContent?.trim()).toBe('Página 6 de 6');
    expect(pagerButtons()[3].disabled).toBe(true);
    expect(pagerButtons()[2].disabled).toBe(true);
    expect(pagerButtons()[1].disabled).toBe(false);

    pagerButtons()[0].click();
    req = request();
    expect(req.request.params.get('pagina')).toBe('1');
    req.flush(page());
    await fixture.whenStable();
    expect(pagerButtons()[0].disabled).toBe(true);
  });
  it('freezes every footer control while a page is loading', async () => {
    await loaded();
    pagerButtons()[2].click();
    await fixture.whenStable();

    expect(pagerButtons().every((b) => b.disabled)).toBe(true);
    expect(root().querySelector<HTMLSelectElement>('#porPagina')?.disabled).toBe(true);
    expect(root().querySelector<HTMLInputElement>('#pagina')?.disabled).toBe(true);
    expect(root().textContent).toContain('Consultando expedientes…');

    request().flush({ ...page(), meta: { ...page().meta, pagina: 2 } });
    await fixture.whenStable();
    expect(pagerButtons().some((b) => !b.disabled)).toBe(true);
  });
  it.each([
    ['0', 'Ingresa un número entre 1 y 6.'],
    ['abc', 'Ingresa un número entre 1 y 6.'],
    ['7', 'Ingresa un número entre 1 y 6.'],
  ])('rejects the jump value %s without spending a request', async (valor, mensaje) => {
    await loaded();
    await submitJump(valor);

    const field = root().querySelector<HTMLInputElement>('#pagina')!;
    const error = root().querySelector('[role="alert"].jump-error');
    expect(error?.textContent).toContain(mensaje);
    expect(error?.id).toBe('pagina-error');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toBe('pagina-error');
    http.expectNone((r) => r.url === URL);
  });
  it('accepts a valid jump, clears the error and re-queries the server', async () => {
    await loaded();
    await submitJump('0');
    expect(root().querySelector('[role="alert"].jump-error')).not.toBeNull();

    await submitJump('3');
    const req = request();
    expect(req.request.params.get('pagina')).toBe('3');
    req.flush({ ...page(), meta: { ...page().meta, pagina: 3 } });
    await fixture.whenStable();

    expect(root().querySelector('[role="alert"].jump-error')).toBeNull();
    expect(root().querySelector<HTMLInputElement>('#pagina')?.getAttribute('aria-invalid')).toBeNull();
    expect(root().querySelector('.pager-page')?.textContent?.trim()).toBe('Página 3 de 6');
  });
});
