import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { BitacoraPage } from './bitacora-page.component';

const URL_BITACORA = `${environment.apiBaseUrl}/bitacora`;

function respuestaListado(overrides: Partial<{ datos: unknown[]; pagina: number; por_pagina: number; total: number; total_paginas: number }> = {}) {
  const datos = overrides.datos ?? [
    {
      id: 1,
      fecha: '2026-11-18T18:42:11+00:00',
      usuario_id: 12,
      usuario_historico: 'Ana López',
      accion: 'empleado.baja',
      modulo: 'expediente',
      descripcion: 'Baja definitiva del trabajador 1002.',
    },
  ];
  const pagina = overrides.pagina ?? 1;
  const por_pagina = overrides.por_pagina ?? 20;
  const total = overrides.total ?? datos.length;
  const total_paginas = overrides.total_paginas ?? 1;
  return {
    datos,
    meta: { pagina, por_pagina, total, total_paginas },
    enlaces: { anterior: null, siguiente: null },
  };
}

describe('BitacoraPage', () => {
  let http: HttpTestingController;
  let router: Router;

  async function create(url = '/bitacora'): Promise<ComponentFixture<BitacoraPage>> {
    TestBed.configureTestingModule({
      imports: [BitacoraPage],
      providers: [
        provideRouter([{ path: 'bitacora', component: BitacoraPage }, { path: 'login', component: BitacoraPage }]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    const fixture = TestBed.createComponent(BitacoraPage);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => {
    http?.verify();
    vi.useRealTimers();
  });

  it('carga inicial consulta la ventana por defecto', async () => {
    const fixture = await create();
    const req = http.expectOne((r) => r.url === URL_BITACORA);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().length).toBe(0);
    req.flush(respuestaListado());
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Últimos 30 días');
  });

  it('cambiar un filtro vuelve a la página 1 y recarga', async () => {
    const fixture = await create('/bitacora?pagina=2');
    http.expectOne((r) => r.url === URL_BITACORA && r.params.get('pagina') === '2')
      .flush(respuestaListado({ pagina: 2, total_paginas: 3, total: 50 }));
    await fixture.whenStable();

    const input = (fixture.nativeElement as HTMLElement).querySelector('#bitacora-modulo') as HTMLInputElement;
    input.value = 'expediente';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === URL_BITACORA && r.params.get('modulo') === 'expediente');
    expect(req.request.params.has('pagina')).toBe(false);
    req.flush(respuestaListado());
    await fixture.whenStable();

    expect(router.url).toContain('modulo=expediente');
    expect(router.url).not.toContain('pagina=');
  });

  it('cambiar el orden vuelve a la página 1 y envía orden', async () => {
    const fixture = await create('/bitacora?pagina=2');
    http.expectOne((r) => r.url === URL_BITACORA && r.params.get('pagina') === '2')
      .flush(respuestaListado({ pagina: 2, total_paginas: 3, total: 50 }));
    await fixture.whenStable();

    const select = (fixture.nativeElement as HTMLElement).querySelector('#bitacora-orden') as HTMLSelectElement;
    select.value = 'asc';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === URL_BITACORA && r.params.get('orden') === 'asc');
    expect(req.request.params.has('pagina')).toBe(false);
    req.flush(respuestaListado());
    await fixture.whenStable();

    expect(router.url).toContain('orden=asc');
    expect(router.url).not.toContain('pagina=');
  });

  it('pagina los resultados', async () => {
    const fixture = await create();
    http.expectOne((r) => r.url === URL_BITACORA)
      .flush(respuestaListado({ pagina: 1, total_paginas: 3, total: 50 }));
    await fixture.whenStable();

    fixture.componentInstance.irA(2);
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === URL_BITACORA && r.params.get('pagina') === '2');
    req.flush(respuestaListado({ pagina: 2, total_paginas: 3, total: 50 }));
    await fixture.whenStable();

    expect(router.url).toContain('pagina=2');
  });

  it('muestra estado vacío', async () => {
    const fixture = await create();
    http.expectOne((r) => r.url === URL_BITACORA)
      .flush(respuestaListado({ datos: [], total: 0, total_paginas: 0 }));
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No hay movimientos en los últimos 30 días');
  });

  it('marca el campo cuando la API responde 400 con campo', async () => {
    const fixture = await create();
    http.expectOne((r) => r.url === URL_BITACORA).flush(respuestaListado());
    await fixture.whenStable();

    const input = (fixture.nativeElement as HTMLElement).querySelector('#bitacora-modulo') as HTMLInputElement;
    input.value = 'expediente';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === URL_BITACORA);
    req.flush({ mensaje: 'El módulo no es válido.', codigo: 'parametros_invalidos', campo: 'modulo' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('El módulo no es válido.');
  });

  it('muestra aviso y acción para 401', async () => {
    const fixture = await create();
    http.expectOne((r) => r.url === URL_BITACORA)
      .flush({ mensaje: 'No autenticado' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Tu sesión venció');
    expect(text).toContain('Iniciar sesión');
  });

  it('muestra aviso final sin reintento para 403', async () => {
    const fixture = await create();
    http.expectOne((r) => r.url === URL_BITACORA)
      .flush({ message: 'No tienes permiso para esta acción.', codigo: 'permiso_denegado' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No tienes permiso para consultar la bitácora');
    expect(text).not.toContain('Reintentar');
  });

  it('maneja 429 con cuenta regresiva y bloquea controles', async () => {
    vi.useFakeTimers();
    const fixture = await create();
    http.expectOne((r) => r.url === URL_BITACORA)
      .flush({ mensaje: 'Límite', codigo: 'limite_consultas', reintentar_en_segundos: 2 }, { status: 429, statusText: 'Too Many Requests' });
    fixture.detectChanges();

    expect(fixture.componentInstance.espera()).toBe(2);
    expect(fixture.componentInstance.controlesDeshabilitados()).toBe(true);

    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(fixture.componentInstance.espera()).toBe(1);

    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(fixture.componentInstance.espera()).toBe(0);
  });

  it('muestra error recuperable en 503', async () => {
    const fixture = await create();
    http.expectOne((r) => r.url === URL_BITACORA)
      .flush({ mensaje: 'Servicio no disponible temporalmente. Intenta más tarde.', codigo: 'servicio_no_disponible' }, { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Servicio no disponible');
    expect(text).toContain('Reintentar');
  });

  it('abre y cierra el detalle en drawer', async () => {
    const fixture = await create();
    http.expectOne((r) => r.url === URL_BITACORA).flush(respuestaListado());
    fixture.detectChanges();

    fixture.componentInstance.abrirDetalle({ id: 1, fecha: '', usuario_id: 12, usuario_historico: 'Ana', accion: 'a', modulo: 'm', descripcion: 'd' });
    fixture.detectChanges();

    const req = http.expectOne(`${URL_BITACORA}/1`);
    req.flush({
      datos: {
        id: 1,
        fecha: '2026-11-18T18:42:11+00:00',
        usuario_id: 12,
        usuario_historico: 'Ana López',
        accion: 'empleado.baja',
        modulo: 'expediente',
        descripcion: 'Baja definitiva',
        ip: '10.0.0.8',
        datos_antes: { estatus: 'activo' },
        datos_despues: { estatus: 'baja_definitiva' },
      },
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.detalleAbierto()).toBe(true);
    expect(fixture.componentInstance.detalle()?.id).toBe(1);

    fixture.componentInstance.cerrarDetalle();
    fixture.detectChanges();
    expect(fixture.componentInstance.detalleAbierto()).toBe(false);
    expect(fixture.componentInstance.detalle()).toBeNull();
  });

  it('maneja 404 del detalle', async () => {
    const fixture = await create();
    http.expectOne((r) => r.url === URL_BITACORA).flush(respuestaListado());
    fixture.detectChanges();

    fixture.componentInstance.abrirDetalle({ id: 99, fecha: '', usuario_id: null, usuario_historico: 'Sistema', accion: 'a', modulo: 'm', descripcion: 'd' });
    fixture.detectChanges();
    http.expectOne(`${URL_BITACORA}/99`).flush({ mensaje: 'El registro de bitácora no existe.', codigo: 'no_encontrado' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(fixture.componentInstance.fallaDetalle()?.status).toBe(404);
  });

  it('sincroniza con URL y no incluye buscar', async () => {
    vi.useFakeTimers();
    const fixture = await create();
    http.expectOne((r) => r.url === URL_BITACORA).flush(respuestaListado());
    fixture.detectChanges();

    const buscar = (fixture.nativeElement as HTMLElement).querySelector('#bitacora-buscar') as HTMLInputElement;
    buscar.value = 'Ana';
    buscar.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    vi.advanceTimersByTime(300);
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === URL_BITACORA && r.params.get('buscar') === 'Ana');
    req.flush(respuestaListado());
    fixture.detectChanges();

    expect(router.url).not.toContain('buscar=');
  });
});
