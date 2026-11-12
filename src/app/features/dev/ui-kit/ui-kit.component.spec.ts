import { TestBed } from '@angular/core/testing';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { UiKit } from './ui-kit.component';

/**
 * Smoke test of the QA screen. It composes the whole kit, so it is also the
 * cheapest proof that the pieces wire together: the buttons raise toasts, the
 * tables receive their inputs and the layers start closed.
 */
describe('UiKit', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [UiKit] }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders the demo sections', async () => {
    const fixture = TestBed.createComponent(UiKit);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('h1')?.textContent).toContain('UI kit');
    const headings = Array.from(host.querySelectorAll('main section h2')).map((node) =>
      node.textContent?.trim(),
    );
    expect(headings).toEqual(['Botón', 'Notificaciones', 'Tabla de datos', 'Capas']);
  });

  it('offers the four button variants and two data tables', async () => {
    const fixture = TestBed.createComponent(UiKit);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    const buttons = Array.from(host.querySelectorAll('app-button button'));
    for (const variant of ['is-primary', 'is-secondary', 'is-ghost', 'is-danger']) {
      expect(buttons.some((button) => button.classList.contains(variant))).toBe(true);
    }
    expect(host.querySelectorAll('app-data-table table').length).toBe(2);
  });

  it('raises a toast through the service', async () => {
    const fixture = TestBed.createComponent(UiKit);
    await fixture.whenStable();
    const service = TestBed.inject(ToastService);

    fixture.componentInstance.notify(fixture.componentInstance.toastExamples[1]);
    await fixture.whenStable();

    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0].type).toBe('error');
  });

  it('marks the selected row and switches the table to its empty state', async () => {
    const fixture = TestBed.createComponent(UiKit);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    fixture.componentInstance.select({ folio: 'RH-0051' });
    await fixture.whenStable();
    const active = host.querySelector('tbody tr.is-active');
    expect(active?.textContent).toContain('RH-0051');

    fixture.componentInstance.toggleEmpty();
    await fixture.whenStable();
    expect(host.textContent).toContain('No hay registros para mostrar.');
  });

  it('starts with both layers closed', async () => {
    const fixture = TestBed.createComponent(UiKit);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    const dialogs = Array.from(host.querySelectorAll('dialog'));
    expect(dialogs.length).toBe(3);
    for (const dialog of dialogs) {
      expect(dialog.hasAttribute('open')).toBe(false);
    }
  });
});
