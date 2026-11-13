import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HistorialCampo } from './historial-campo.component';
import { environment } from '../../../../environments/environment';

const URL = `${environment.apiBaseUrl}/empleados/17/informacion-historial`;
const respuesta = (total = 1) => ({
  datos: [
    {
      id: 2,
      campo: 'exp_publico_anios',
      antes: 15,
      despues: 20,
      valor_anterior: '15 años',
      valor_nuevo: '20 años',
      fecha: '2026-11-13T19:30:00Z',
      responsable: 'Responsable de prueba',
    },
  ],
  meta: { pagina: 1, por_pagina: 5, total, total_paginas: Math.max(1, Math.ceil(total / 5)) },
});
describe('Historial individual de campo', () => {
  let fixture: ComponentFixture<HistorialCampo>;
  let http: HttpTestingController;
  const root = () => fixture.nativeElement as HTMLElement;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HistorialCampo],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(HistorialCampo);
    fixture.componentRef.setInput('empleadoId', 17);
    fixture.componentRef.setInput('campo', 'exp_publico_anios');
    fixture.componentRef.setInput('etiqueta', 'Experiencia pública (años)');
    await fixture.whenStable();
  });
  afterEach(() => http.verify());
  async function abrir() {
    fixture.componentInstance.alternar({ target: { open: true } } as unknown as Event);
    await fixture.whenStable();
    return http.expectOne((r) => r.url === URL);
  }
  it('is initially collapsed, labelled, and makes no initial HTTP request', () => {
    expect(root().querySelector('details')?.open).toBe(false);
    expect(root().querySelector('summary')?.getAttribute('aria-label')).toContain(
      'Experiencia pública',
    );
    http.expectNone((r) => r.url === URL);
  });
  it('requests only its field and renders raw server history labels and responsible', async () => {
    const req = await abrir();
    expect(req.request.params.get('campo')).toBe('exp_publico_anios');
    expect(req.request.params.get('por_pagina')).toBe('5');
    req.flush(respuesta());
    await fixture.whenStable();
    expect(root().textContent).toContain('15 años');
    expect(root().textContent).toContain('20 años');
    expect(root().textContent).toContain('Responsable de prueba');
    expect(root().querySelector('time')?.getAttribute('datetime')).toBe('2026-11-13T19:30:00Z');
    expect(root().querySelector('summary')?.textContent).toContain('(1)');
    fixture.componentInstance.alternar({ target: { open: false } } as unknown as Event);
    await fixture.whenStable();
    expect(root().querySelector('.content')).toBeNull();
    fixture.componentInstance.alternar({ target: { open: true } } as unknown as Event);
    await fixture.whenStable();
    http.expectNone((r) => r.url === URL); // No redundant read.
  });
  it('paginates all changes server-side and never introduces a nested form', async () => {
    (await abrir()).flush(respuesta(11));
    await fixture.whenStable();
    fixture.componentInstance.cargar(2);
    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.get('pagina')).toBe('2');
    req.flush({ ...respuesta(11), meta: { ...respuesta(11).meta, pagina: 2 } });
    await fixture.whenStable();
    expect(root().querySelector('form')).toBeNull();
  });
  it('cancels in-flight reads when collapsed', async () => {
    const req = await abrir();
    fixture.componentInstance.alternar({ target: { open: false } } as unknown as Event);
    expect(req.cancelled).toBe(true);
  });
  it('refreshes an expanded history after a successful-save revision', async () => {
    (await abrir()).flush(respuesta());
    await fixture.whenStable();
    fixture.componentRef.setInput('revision', 1);
    await fixture.whenStable();
    const req = http.expectOne((r) => r.url === URL);
    req.flush({
      ...respuesta(2),
      datos: [
        { ...respuesta().datos[0], id: 3, valor_anterior: '20 años', valor_nuevo: '25 años' },
        respuesta().datos[0],
      ],
    });
    await fixture.whenStable();
    expect(root().textContent).toContain('25 años');
    expect(root().querySelectorAll('li')).toHaveLength(2);
  });
  it('clears old employee data and cancels before querying a different employee', async () => {
    const req = await abrir();
    fixture.componentRef.setInput('empleadoId', 18);
    await fixture.whenStable();
    expect(req.cancelled).toBe(true);
    http
      .expectOne((r) => r.url.includes('/empleados/18/'))
      .flush({ datos: [], meta: { pagina: 1, por_pagina: 5, total: 0, total_paginas: 1 } });
    await fixture.whenStable();
    expect(root().textContent).toContain('Sin cambios registrados.');
    expect(root().textContent).not.toContain('15 años');
  });
  it('handles read errors without exposing backend traces and permits retry', async () => {
    (await abrir()).flush({ message: 'SQL SECRET' }, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(root().textContent).toContain('No se pudo consultar');
    expect(root().textContent).not.toContain('SQL SECRET');
    fixture.componentInstance.cargar(1);
    http.expectOne((r) => r.url === URL).flush(respuesta());
    await fixture.whenStable();
    expect(root().textContent).toContain('20 años');
  });
});
