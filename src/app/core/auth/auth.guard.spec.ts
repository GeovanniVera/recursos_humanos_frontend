import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { Observable } from 'rxjs';
import { authGuard, guestGuard } from './auth.guard';
import { TokenStorageService } from './token-storage.service';

/** Records the navigations the guards ask for instead of running a router. */
class RouterStub {
  readonly navigations: unknown[][] = [];

  navigate(commands: unknown[]): Promise<boolean> {
    this.navigations.push(commands);
    return Promise.resolve(true);
  }
}

const route = {} as ActivatedRouteSnapshot;
const state = {} as RouterStateSnapshot;

describe('authGuard', () => {
  let router: RouterStub;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    router = new RouterStub();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('sends the user to /login and blocks access without a token', () => {
    const result = TestBed.runInInjectionContext(() => authGuard(route, state));

    expect(result).toBe(false);
    expect(router.navigations).toEqual([['/login']]);
  });

  it('loads the session behind an existing token', () => {
    TestBed.inject(TokenStorageService).write('token-vigente');

    const result = TestBed.runInInjectionContext(
      () => authGuard(route, state),
    ) as Observable<boolean>;
    const allowed: boolean[] = [];
    result.subscribe((value) => allowed.push(value));

    expect(router.navigations).toEqual([]);
    httpMock
      .expectOne((candidate) => candidate.url.endsWith('/auth/sesion'))
      .flush({ usuario_id: 1, empleado_id: 2, nombre: 'Prueba', rol: 'rh' });

    expect(allowed).toEqual([true]);
  });

  it('drops the session and redirects when the token is rejected', () => {
    TestBed.inject(TokenStorageService).write('token-vencido');

    const result = TestBed.runInInjectionContext(
      () => authGuard(route, state),
    ) as Observable<boolean>;
    const allowed: boolean[] = [];
    result.subscribe((value) => allowed.push(value));

    httpMock
      .expectOne((candidate) => candidate.url.endsWith('/auth/sesion'))
      .flush({ message: 'Unauthenticated.' }, { status: 401, statusText: 'Unauthorized' });

    expect(allowed).toEqual([false]);
    expect(router.navigations).toEqual([['/login']]);
    expect(TestBed.inject(TokenStorageService).read()).toBeNull();
  });

  it('guestGuard lets the login screen through without a token', () => {
    const result = TestBed.runInInjectionContext(() => guestGuard(route, state));

    expect(result).toBe(true);
    expect(router.navigations).toEqual([]);
  });

  it('guestGuard sends an authenticated user to the landing page', () => {
    TestBed.inject(TokenStorageService).write('token-vigente');

    const result = TestBed.runInInjectionContext(() => guestGuard(route, state));

    expect(result).toBe(false);
    expect(router.navigations).toEqual([['/']]);
  });
});
