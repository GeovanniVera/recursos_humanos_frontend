import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '../http/auth.interceptor';
import { TokenStorageService } from '../auth/token-storage.service';
import { SemaforoService } from './semaforo.service';

const URL = `${environment.apiBaseUrl}/semaforo`;
describe('SemaforoService', () => {
  let http: HttpTestingController;
  let api: SemaforoService;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(SemaforoService);
    TestBed.inject(TokenStorageService).clear();
  });
  afterEach(() => {
    http.verify();
    TestBed.inject(TokenStorageService).clear();
    TestBed.resetTestingModule();
  });
  it('sends only set parameters and reuses the bearer interceptor', () => {
    TestBed.inject(TokenStorageService).write('token-de-prueba');
    api
      .consultar({
        buscar: '  0  ',
        estado: 'incompleto',
        pagina: 2,
        por_pagina: 10,
        ordenar_por: 'nombre',
        direccion: 'desc',
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-de-prueba');
    expect(req.request.params.get('buscar')).toBe('0');
    expect(req.request.params.get('estado')).toBe('incompleto');
    expect(req.request.params.get('pagina')).toBe('2');
    expect(req.request.params.get('por_pagina')).toBe('10');
    expect(req.request.params.get('ordenar_por')).toBe('nombre');
    expect(req.request.params.get('direccion')).toBe('desc');
    req.flush({});
  });
  it('omits blank search and absent state for Todos', () => {
    api.consultar({ buscar: '  ' }).subscribe();
    const req = http.expectOne(URL);
    expect(req.request.params.keys()).toEqual([]);
    req.flush({});
  });
  it('lets failures reach the view without manufacturing data', () => {
    const fail = vi.fn();
    api.consultar().subscribe({ error: fail });
    http.expectOne(URL).flush({}, { status: 403, statusText: 'Forbidden' });
    expect(fail).toHaveBeenCalledOnce();
  });

  it('calls reminder state, manual send, batch send, config, and history endpoints', () => {
    api.obtenerEstadoRecordatorios([7, 8]).subscribe();
    const estadoReq = http.expectOne((r) => r.url === `${URL}/recordatorios/estado`);
    expect(estadoReq.request.params.get('empleado_ids')).toBe('7,8');
    estadoReq.flush({ datos: { config: {}, empleados: {} } });

    api.enviarRecordatorioIndividual(7).subscribe();
    const indReq = http.expectOne(`${URL}/recordatorios/enviar`);
    expect(indReq.request.method).toBe('POST');
    expect(indReq.request.body).toEqual({ empleado_id: 7 });
    indReq.flush({ datos: {} });

    api.enviarRecordatorioLote('incompleto').subscribe();
    const loteReq = http.expectOne(`${URL}/recordatorios/enviar-lote`);
    expect(loteReq.request.method).toBe('POST');
    expect(loteReq.request.body).toEqual({ estado: 'incompleto' });
    loteReq.flush({ datos: {} });

    api
      .actualizarConfigRecordatorios({
        activo: true,
        dias_incompleto: 2,
        dias_casi_completo: 5,
        asunto_incompleto: 'Asunto inc',
        mensaje_incompleto: 'Mensaje incompleto largo',
        asunto_casi_completo: 'Asunto casi',
        mensaje_casi_completo: 'Mensaje casi completo largo',
      })
      .subscribe();
    const cfgReq = http.expectOne(`${URL}/recordatorios/configuracion`);
    expect(cfgReq.request.method).toBe('PUT');
    cfgReq.flush({ datos: {} });

    api.consultarHistorialRecordatorios({ estado_expediente: 'incompleto', pagina: 2 }).subscribe();
    const histReq = http.expectOne((r) => r.url === `${URL}/recordatorios/historial`);
    expect(histReq.request.params.get('estado_expediente')).toBe('incompleto');
    expect(histReq.request.params.get('pagina')).toBe('2');
    histReq.flush({ datos: [], meta: { pagina: 2, por_pagina: 10, total: 0, total_paginas: 1 } });
  });
});
