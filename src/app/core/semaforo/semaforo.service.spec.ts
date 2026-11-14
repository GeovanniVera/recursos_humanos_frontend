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
});
