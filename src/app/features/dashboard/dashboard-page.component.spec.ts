import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { DashboardPage } from './dashboard-page.component';

const URL_RESUMEN = `${environment.apiBaseUrl}/dashboard/resumen`;

/** `200` body of the endpoint, straight from the contract. */
const RESUMEN = { empleados_activos: 10, empleados_baja: 2, expedientes_completos: 4 };

interface DialogPrototypePatch {
  showModal: () => void;
  close: () => void;
}

/**
 * jsdom ships `HTMLDialogElement` without `showModal` / `close`, so the layer
 * would never render. The stub reflects the `open` attribute and fires `close`,
 * which is exactly the part of the platform the modal component relies on.
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

function host(fixture: ComponentFixture<DashboardPage>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function text(fixture: ComponentFixture<DashboardPage>): string {
  return host(fixture).textContent ?? '';
}

/** Values of the three cards, in the order they are rendered. */
function valores(fixture: ComponentFixture<DashboardPage>): string[] {
  return Array.from(host(fixture).querySelectorAll('app-kpi-card')).map(
    (card) => card.querySelector('.value')?.textContent?.trim() ?? '',
  );
}

/** Hints of the three cards; an absent line reads as the empty string. */
function pistas(fixture: ComponentFixture<DashboardPage>): string[] {
  return Array.from(host(fixture).querySelectorAll('app-kpi-card')).map(
    (card) => card.querySelector('.hint')?.textContent?.trim() ?? '',
  );
}

function kpiRegion(fixture: ComponentFixture<DashboardPage>): HTMLElement {
  const region = host(fixture).querySelector<HTMLElement>('section.kpis');
  if (region === null) {
    throw new Error('No KPI region rendered');
  }
  return region;
}

/** Third card, the one that opens the layer. */
function expedientesButton(fixture: ComponentFixture<DashboardPage>): HTMLButtonElement {
  const button = host(fixture)
    .querySelectorAll('app-kpi-card')[2]
    ?.querySelector<HTMLButtonElement>('button');
  if (!button) {
    throw new Error('The expedientes card is not a button');
  }
  return button;
}

/** Text of the projected action, whatever element wraps it. */
function actionButton(
  fixture: ComponentFixture<DashboardPage>,
  label: string,
): HTMLButtonElement | undefined {
  return Array.from(host(fixture).querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    (button.textContent ?? '').includes(label),
  );
}

/** Layer of a given title: this screen mounts one per card. */
function dialogo(fixture: ComponentFixture<DashboardPage>, titulo: string): HTMLDialogElement {
  const found = Array.from(host(fixture).querySelectorAll<HTMLDialogElement>('dialog')).find(
    (dialog) => dialog.querySelector('h2.title')?.textContent?.trim() === titulo,
  );
  if (!found) {
    throw new Error(`No layer titled ${titulo}`);
  }
  return found;
}

/** The card whose text mentions a label, as the button it now renders. */
function cardButton(fixture: ComponentFixture<DashboardPage>, label: string): HTMLButtonElement {
  const card = Array.from(host(fixture).querySelectorAll('app-kpi-card')).find((element) =>
    (element.textContent ?? '').includes(label),
  );
  const button = card?.querySelector<HTMLButtonElement>('button');
  if (!button) {
    throw new Error(`The card ${label} is not a button`);
  }
  return button;
}

describe('DashboardPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    patchDialogPrototype();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  /** Creates the screen; the constructor already asked for the summary. */
  async function render(): Promise<ComponentFixture<DashboardPage>> {
    const fixture = TestBed.createComponent(DashboardPage);
    await fixture.whenStable();
    return fixture;
  }

  it('renders the three counters of a successful answer', async () => {
    const fixture = await render();

    httpMock.expectOne(URL_RESUMEN).flush({ datos: RESUMEN });
    await fixture.whenStable();

    expect(valores(fixture)).toEqual(['10', '2', '4']);
    expect(text(fixture)).toContain('Empleados activos');
    expect(text(fixture)).toContain('Empleados baja');
    expect(text(fixture)).toContain('Expedientes completos');
    expect(kpiRegion(fixture).hasAttribute('aria-busy')).toBe(false);
  });

  it('computes the percentage of complete files over the active employees', async () => {
    const fixture = await render();

    httpMock.expectOne(URL_RESUMEN).flush({ datos: RESUMEN });
    await fixture.whenStable();

    // 4 / 10 is not in the payload: the client derives it.
    expect(pistas(fixture)[2]).toBe('40 % de los activos');
  });

  it('shows no percentage when there is no active employee to divide by', async () => {
    const fixture = await render();

    httpMock.expectOne(URL_RESUMEN).flush({
      datos: { empleados_activos: 0, empleados_baja: 3, expedientes_completos: 0 },
    });
    await fixture.whenStable();

    expect(valores(fixture)).toEqual(['0', '3', '0']);
    expect(pistas(fixture)[2]).toBe('Sin porcentaje');
  });

  it('announces itself as busy and shows no figure while loading', async () => {
    const fixture = await render();

    expect(kpiRegion(fixture).getAttribute('aria-busy')).toBe('true');
    // Never `0`: zero is a real answer of this endpoint.
    expect(valores(fixture)).toEqual(['—', '—', '—']);
    expect(text(fixture)).not.toContain('0 %');
    // The only data-derived hint stays out of the screen while the data is unknown.
    expect(pistas(fixture)).toEqual(['Activos y sin fecha de baja', 'Cuentas inactivas', '']);

    httpMock.expectOne(URL_RESUMEN).flush({ datos: RESUMEN });
    await fixture.whenStable();
  });

  it('offers a retry when the service is unavailable, and the retry refetches', async () => {
    const fixture = await render();

    httpMock
      .expectOne(URL_RESUMEN)
      .flush(
        { message: 'El servicio no está disponible.', codigo: 'servicio_no_disponible' },
        { status: 503, statusText: 'Service Unavailable' },
      );
    await fixture.whenStable();

    expect(text(fixture)).toContain('El servicio no está disponible. Reintentá en unos segundos.');

    actionButton(fixture, 'Reintentar')?.click();
    await fixture.whenStable();

    httpMock.expectOne(URL_RESUMEN).flush({ datos: RESUMEN });
    await fixture.whenStable();

    expect(valores(fixture)).toEqual(['10', '2', '4']);
  });

  it('explains a permission failure and shows the contract code', async () => {
    const fixture = await render();

    httpMock
      .expectOne(URL_RESUMEN)
      .flush(
        { message: 'Permiso denegado.', codigo: 'permiso_denegado' },
        { status: 403, statusText: 'Forbidden' },
      );
    await fixture.whenStable();

    expect(text(fixture)).toContain('No tenés permisos para ver el panel.');
    expect(text(fixture)).toContain('permiso_denegado');
    // Nothing to retry: the answer will not change by asking again.
    expect(actionButton(fixture, 'Reintentar')).toBeUndefined();
    expect(host(fixture).querySelector('[role="alert"]')).not.toBeNull();
  });

  it('sends the user back to the login when the session expired', async () => {
    sessionStorage.setItem('utn-rh.token', 'token-vencido');
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const fixture = await render();
    httpMock
      .expectOne(URL_RESUMEN)
      .flush({ message: 'No autenticado.' }, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();

    expect(text(fixture)).toContain('Tu sesión venció. Volvé a iniciar sesión.');

    actionButton(fixture, 'Iniciar sesión')?.click();
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith(['/login']);
    expect(sessionStorage.getItem('utn-rh.token')).toBeNull();
  });

  it('blames the connection when the request never reached the server', async () => {
    const fixture = await render();

    httpMock.expectOne(URL_RESUMEN).error(new ProgressEvent('error'), { status: 0 });
    await fixture.whenStable();

    expect(text(fixture)).toContain('No pudimos conectar con el servidor. Revisá tu conexión.');
    expect(actionButton(fixture, 'Reintentar')).toBeDefined();
  });

  it('opens the layer of the metric from its card and closes it with Cancelar', async () => {
    const fixture = await render();
    httpMock.expectOne(URL_RESUMEN).flush({ datos: RESUMEN });
    await fixture.whenStable();

    const dialog = dialogo(fixture, 'Expedientes completos');
    expect(dialog.hasAttribute('open')).toBe(false);

    expedientesButton(fixture).click();
    await fixture.whenStable();

    expect(dialog.hasAttribute('open')).toBe(true);
    // The content explains the metric with the contract's own definition.
    expect(dialog.textContent).toContain('quince campos vigentes');
    expect(dialog.textContent).toContain('4');
    expect(dialog.textContent).toContain('40 %');

    const confirm = Array.from(dialog.querySelectorAll<HTMLButtonElement>('.footer button')).find(
      (button) => (button.textContent ?? '').includes('Cancelar'),
    );
    confirm?.click();
    await fixture.whenStable();

    expect(dialog.hasAttribute('open')).toBe(false);
  });

  it('turns every card into a shortcut to the screen behind it', async () => {
    const fixture = await render();
    httpMock.expectOne(URL_RESUMEN).flush({ datos: RESUMEN });
    await fixture.whenStable();

    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    cardButton(fixture, 'Empleados activos').click();
    await fixture.whenStable();

    const activos = dialogo(fixture, 'Empleados activos');
    expect(activos.hasAttribute('open')).toBe(true);

    const go = Array.from(activos.querySelectorAll<HTMLButtonElement>('.footer button')).find(
      (button) => (button.textContent ?? '').includes('Ir a empleados activos'),
    );
    go?.click();
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith(['/empleados/activos']);
    // The layer closes before moving, so it cannot float over the new screen.
    expect(activos.hasAttribute('open')).toBe(false);

    cardButton(fixture, 'Empleados baja').click();
    await fixture.whenStable();

    const baja = dialogo(fixture, 'Empleados baja');
    expect(baja.hasAttribute('open')).toBe(true);
  });
});
