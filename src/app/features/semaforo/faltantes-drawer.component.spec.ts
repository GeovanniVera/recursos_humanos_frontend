import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { FaltantesDrawer } from './faltantes-drawer.component';

const URL = `${environment.apiBaseUrl}/semaforo`;
describe('FaltantesDrawer', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<FaltantesDrawer>;
  beforeEach(async () => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
    await TestBed.configureTestingModule({
      imports: [FaltantesDrawer],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(FaltantesDrawer);
    await fixture.whenStable();
  });
  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });
  async function open(id = 1): Promise<void> {
    fixture.componentRef.setInput('empleadoId', id);
    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
  }
  it('does not request when closed and cancels requests when closing or changing worker', async () => {
    http.expectNone((r) => r.url.includes('/faltantes'));
    await open();
    const old = http.expectOne(`${URL}/1/faltantes`);
    fixture.componentRef.setInput('empleadoId', 2);
    await fixture.whenStable();
    expect(old.cancelled).toBe(true);
    const current = http.expectOne(`${URL}/2/faltantes`);
    fixture.componentInstance.open.set(false);
    await fixture.whenStable();
    expect(current.cancelled).toBe(true);
    expect(fixture.componentInstance.datos()).toBeNull();
  });
  it('shows a complete empty detail exactly as the API reports, with no invented fields', async () => {
    await open();
    http.expectOne(`${URL}/1/faltantes`).flush({
      datos: {
        empleado: { id: 1, num_empleado: '10', nombre: 'Prueba' },
        semaforo: {
          estado: 'completo',
          porcentaje: 100,
          total_campos: 19,
          campos_completos: 19,
          campos_faltantes: 0,
          detalle_faltantes: [],
        },
      },
    });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No hay campos obligatorios pendientes');
    expect(el.querySelectorAll('li')).toHaveLength(0);
    expect(el.querySelectorAll('input')).toHaveLength(0);
  });
  it.each([401, 403, 404, 500])(
    'handles HTTP %s, clears stale detail and supports allowed retry',
    async (status) => {
      await open();
      http
        .expectOne(`${URL}/1/faltantes`)
        .flush({ message: 'SECRET TRACE' }, { status, statusText: 'Error' });
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[role="alert"]')).not.toBeNull();
      expect(el.textContent).not.toContain('SECRET');
      if (status === 500) {
        fixture.componentInstance.reintentar();
        http.expectOne(`${URL}/1/faltantes`).flush({ datos: null });
      }
    },
  );
});
