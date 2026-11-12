import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { TokenStorageService } from '../auth/token-storage.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let httpMock: HttpTestingController;
  let storage: TokenStorageService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    // AuthService reads the stored token at construction, so it is resolved
    // inside each test after the token has been written.
    httpMock = TestBed.inject(HttpTestingController);
    storage = TestBed.inject(TokenStorageService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('attaches the bearer token to outgoing requests', () => {
    storage.write('abc123');
    const auth = TestBed.inject(AuthService);

    auth.cargarSesion().subscribe();

    const request = httpMock.expectOne((req) => req.url.endsWith('/auth/sesion'));
    expect(request.request.headers.get('Authorization')).toBe('Bearer abc123');
    request.flush({ usuario_id: 1, empleado_id: 7, nombre: 'Prueba', rol: 'rh' });
  });

  it('sends no Authorization header when there is no token', () => {
    const auth = TestBed.inject(AuthService);

    auth.cargarSesion().subscribe();

    const request = httpMock.expectOne((req) => req.url.endsWith('/auth/sesion'));
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ usuario_id: 1, empleado_id: 7, nombre: null, rol: null });
  });

  it('clears the local session when the backend answers 401', () => {
    storage.write('expired-token');
    const auth = TestBed.inject(AuthService);
    expect(auth.estaAutenticado()).toBe(true);

    let failed = false;
    auth.cargarSesion().subscribe({ error: () => (failed = true) });

    const request = httpMock.expectOne((req) => req.url.endsWith('/auth/sesion'));
    request.flush(
      { message: 'Unauthenticated.' },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(failed).toBe(true);
    expect(storage.read()).toBeNull();
    expect(auth.estaAutenticado()).toBe(false);
  });
});
