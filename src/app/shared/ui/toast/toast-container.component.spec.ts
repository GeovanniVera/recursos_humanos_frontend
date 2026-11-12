import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToastContainer } from './toast-container.component';
import { ToastService } from './toast.service';

function cards(fixture: ComponentFixture<ToastContainer>): HTMLElement[] {
  const host = fixture.nativeElement as HTMLElement;
  return Array.from(host.querySelectorAll<HTMLElement>('.toast'));
}

async function createContainer(): Promise<{
  fixture: ComponentFixture<ToastContainer>;
  service: ToastService;
}> {
  const fixture = TestBed.createComponent(ToastContainer);
  await fixture.whenStable();
  return { fixture, service: TestBed.inject(ToastService) };
}

describe('ToastContainer', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToastContainer],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders one card per toast, in order', async () => {
    const { fixture, service } = await createContainer();

    service.show({ type: 'success', title: 'Guardado correctamente', message: 'Listo.' });
    service.show({ type: 'info', title: 'Nueva versión disponible' });
    await fixture.whenStable();

    const rendered = cards(fixture);
    expect(rendered.length).toBe(2);
    expect(rendered[0].textContent).toContain('Guardado correctamente');
    expect(rendered[0].textContent).toContain('Listo.');
    expect(rendered[1].textContent).toContain('Nueva versión disponible');
  });

  it('marks only error and warning as alerts', async () => {
    const { fixture, service } = await createContainer();

    service.show({ type: 'success', title: 'Éxito' });
    service.show({ type: 'error', title: 'Error' });
    service.show({ type: 'info', title: 'Información' });
    service.show({ type: 'warning', title: 'Advertencia' });
    await fixture.whenStable();

    const roles = cards(fixture).map((card) => card.getAttribute('role'));
    expect(roles).toEqual([null, 'alert', null, 'alert']);
  });

  it('keeps a polite live region around the stack', async () => {
    const { fixture } = await createContainer();
    const host = fixture.nativeElement as HTMLElement;
    const live = host.querySelector<HTMLElement>('[aria-live]');

    expect(live?.getAttribute('aria-live')).toBe('polite');
    expect(live?.getAttribute('aria-atomic')).toBe('false');
  });

  it('closes a toast from its own button', async () => {
    const { fixture, service } = await createContainer();
    service.show({ type: 'error', title: 'Error al guardar' });
    await fixture.whenStable();

    const close = cards(fixture)[0].querySelector<HTMLButtonElement>('.close');
    expect(close?.getAttribute('aria-label')).toBe('Cerrar notificación');

    close?.click();
    await fixture.whenStable();

    expect(cards(fixture).length).toBe(0);
    expect(service.toasts().length).toBe(0);
  });

  it('names the state with an icon that assistive tech skips', async () => {
    const { fixture, service } = await createContainer();
    service.show({ type: 'warning', title: 'Sesión por expirar' });
    await fixture.whenStable();

    const icon = cards(fixture)[0].querySelector('.icon');
    // The icon repeats the state the copy already states; the text carries the
    // meaning, so the disc stays out of the accessibility tree.
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.querySelector('svg')).not.toBeNull();
  });
});
