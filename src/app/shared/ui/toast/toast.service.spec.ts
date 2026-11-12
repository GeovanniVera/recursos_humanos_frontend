import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

/**
 * The service is used directly, with no fixture: the collection is a signal and
 * the timers are plain `setTimeout`s, so nothing here depends on change
 * detection. That is what lets `vi.useFakeTimers()` drive the auto-dismiss: a
 * zoneless `whenStable()` would otherwise have to wait for the real clock.
 */
function createService(): ToastService {
  TestBed.resetTestingModule();
  return TestBed.inject(ToastService);
}

describe('ToastService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds a toast and returns its id', () => {
    const service = createService();

    const id = service.show({ type: 'success', title: 'Guardado correctamente' });

    expect(typeof id).toBe('number');
    expect(service.toasts().length).toBe(1);
    expect(service.toasts()[0]).toEqual({
      id,
      type: 'success',
      title: 'Guardado correctamente',
    });
  });

  it('hands out a different id to every toast', () => {
    const service = createService();

    const first = service.show({ type: 'info', title: 'Uno' });
    const second = service.show({ type: 'info', title: 'Dos' });

    expect(first).not.toBe(second);
  });

  it('removes a toast when it is dismissed', () => {
    const service = createService();
    const id = service.show({ type: 'warning', title: 'Sesión por expirar' });

    service.dismiss(id);

    expect(service.toasts().length).toBe(0);
  });

  it('ignores the id of a toast that is already gone', () => {
    const service = createService();
    const id = service.show({ type: 'warning', title: 'Sesión por expirar' });

    service.dismiss(id);
    service.dismiss(id);

    expect(service.toasts().length).toBe(0);
  });

  it('keeps four visible and drops the oldest when a fifth arrives', () => {
    const service = createService();

    for (let index = 1; index <= 5; index += 1) {
      service.show({ type: 'info', title: `Aviso ${index}` }, { duration: 0 });
    }

    const titles = service.toasts().map((toast) => toast.title);
    expect(service.toasts().length).toBe(4);
    expect(titles).toEqual(['Aviso 2', 'Aviso 3', 'Aviso 4', 'Aviso 5']);
  });

  it('dismisses itself after the default five seconds', () => {
    const service = createService();
    vi.useFakeTimers();

    service.show({ type: 'success', title: 'Guardado correctamente' });
    expect(service.toasts().length).toBe(1);

    vi.advanceTimersByTime(4999);
    expect(service.toasts().length).toBe(1);

    vi.advanceTimersByTime(1);
    expect(service.toasts().length).toBe(0);
  });

  it('honours a custom duration', () => {
    const service = createService();
    vi.useFakeTimers();

    service.show({ type: 'info', title: 'Corto' }, { duration: 1000 });
    vi.advanceTimersByTime(1000);

    expect(service.toasts().length).toBe(0);
  });

  it('keeps a toast with duration 0 until it is dismissed', () => {
    const service = createService();
    vi.useFakeTimers();

    const id = service.show({ type: 'info', title: 'Sin cierre automático' }, { duration: 0 });

    vi.advanceTimersByTime(60_000);
    expect(service.toasts().length).toBe(1);

    service.dismiss(id);
    expect(service.toasts().length).toBe(0);
  });

  it('clears the timer of a toast that left early, so it cannot fire twice', () => {
    const service = createService();
    vi.useFakeTimers();
    const id = service.show({ type: 'info', title: 'Efímero' }, { duration: 5000 });

    service.dismiss(id);
    // A leaked timer would try to dismiss an id that is no longer in the stack.
    service.show({ type: 'info', title: 'Otro' }, { duration: 0 });

    vi.advanceTimersByTime(5000);

    expect(service.toasts().map((toast) => toast.title)).toEqual(['Otro']);
  });

  it('dismisses every toast at once and cancels their timers', () => {
    const service = createService();
    vi.useFakeTimers();
    service.show({ type: 'info', title: 'Uno' });
    service.show({ type: 'error', title: 'Dos' });

    service.dismissAll();
    expect(service.toasts().length).toBe(0);

    // Nothing is pending: advancing the clock must not resurrect anything.
    vi.advanceTimersByTime(10_000);
    expect(service.toasts().length).toBe(0);
  });
});
