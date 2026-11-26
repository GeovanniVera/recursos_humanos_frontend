import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  provideRouter,
} from '@angular/router';
import { App } from '../../app.component';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { authInterceptor } from '../http/auth.interceptor';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { TokenStorageService } from './token-storage.service';

@Component({ template: '<p>Ruta de prueba</p>' })
class TestScreen {}

describe('Expired session notification', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(TokenStorageService).write('old-token');
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.useRealTimers();
  });

  function reject(url: string): void {
    TestBed.inject(HttpTestingController)
      .expectOne(url)
      .flush({}, { status: 401, statusText: 'Unauthorized' });
  }

  function request(url: string): void {
    TestBed.inject(HttpClient)
      .get(url)
      .subscribe({ error: () => {} });
  }

  it('invalidates immediately, keeps one persistent error for concurrent 401s and blocks further requests', () => {
    vi.useFakeTimers();
    const auth = TestBed.inject(AuthService);
    const toast = TestBed.inject(ToastService);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    request('/protected/one');
    request('/protected/two');
    reject('/protected/one');
    reject('/protected/two');
    expect(auth.token()).toBeNull();
    expect(auth.sesion()).toBeNull();
    expect(auth.permisos().size).toBe(0);
    expect(TestBed.inject(TokenStorageService).read()).toBeNull();
    expect(toast.toasts()).toHaveLength(1);
    expect(toast.toasts()[0]).toMatchObject({ type: 'error', title: 'Sesión expirada' });
    vi.advanceTimersByTime(600_000);
    expect(toast.toasts()).toHaveLength(1);
    request('/protected/blocked');
    TestBed.inject(HttpTestingController).expectNone('/protected/blocked');
    expect(
      TestBed.runInInjectionContext(() =>
        authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      ),
    ).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    const id = toast.toasts()[0].id;
    toast.dismiss(id);
    toast.dismiss(id);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/login'], { replaceUrl: true });
  });

  it('uses the existing accessible close button and removes protected views until login navigation completes', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const auth = TestBed.inject(AuthService);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    auth.notificarSesionExpirada();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('router-outlet')).toBeNull();
    expect(host.querySelectorAll('app-toast-container')).toHaveLength(1);
    expect(host.querySelector('.toast.is-error')?.getAttribute('role')).toBe('alert');
    (host.querySelector('button[aria-label="Cerrar notificación"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/login'], { replaceUrl: true });
    expect(auth.expiracionPendiente()).toBe(false);
    expect(host.querySelector('router-outlet')).not.toBeNull();
  });

  it('leaves the preventive warning valid and does not redirect', () => {
    const auth = TestBed.inject(AuthService);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const toast = TestBed.inject(ToastService);
    const id = toast.show({ type: 'warning', title: 'Sesión por expirar' });
    toast.dismiss(id);
    expect(auth.token()).toBe('old-token');
    expect(auth.expiracionPendiente()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores unauthenticated OTP errors and cancels stale expiration callbacks after a new login', () => {
    const auth = TestBed.inject(AuthService);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    request('/protected/late');
    auth.notificarSesionExpirada();
    const toast = TestBed.inject(ToastService);
    const oldId = toast.toasts()[0].id;
    auth.verificarCodigo('prueba@example.test', '123456').subscribe();
    TestBed.inject(HttpTestingController)
      .expectOne((req) => req.url.endsWith('/auth/otp/verificar'))
      .flush({ token: 'new-token', redirect: '/' });
    reject('/protected/late');
    toast.dismiss(oldId);
    expect(auth.token()).toBe('new-token');
    expect(auth.expiracionPendiente()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    auth.limpiarSesionLocal();
    auth.solicitarCodigo('prueba@example.test').subscribe({ error: () => {} });
    const otp = TestBed.inject(HttpTestingController).expectOne((req) =>
      req.url.endsWith('/auth/otp'),
    );
    otp.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.expiracionPendiente()).toBe(false);
  });

  it('keeps the expiration action reachable when other notifications overflow', () => {
    TestBed.inject(AuthService).notificarSesionExpirada();
    const toast = TestBed.inject(ToastService);
    const id = toast.toasts()[0].id;
    for (let index = 0; index < 6; index++) toast.show({ type: 'info', title: 'Aviso' });
    expect(toast.toasts().some((item) => item.id === id)).toBe(true);
    expect(toast.toasts()).toHaveLength(4);
  });

  it('actually navigates to login on close and refuses protected navigation afterwards', async () => {
    const router = TestBed.inject(Router);
    router.resetConfig([
      { path: 'protected', component: TestScreen, canActivate: [authGuard] },
      { path: 'login', component: TestScreen },
    ]);
    const auth = TestBed.inject(AuthService);
    auth.cargarSesion().subscribe();
    TestBed.inject(HttpTestingController)
      .expectOne((req) => req.url.endsWith('/auth/sesion'))
      .flush({ permisos: ['empleados.ver'] });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    await router.navigateByUrl('/protected');
    request('/protected/data');
    reject('/protected/data');
    await fixture.whenStable();
    expect(router.url).toBe('/protected');
    (
      fixture.nativeElement.querySelector(
        'button[aria-label="Cerrar notificación"]',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    expect(router.url).toBe('/login');
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
    await router.navigateByUrl('/protected');
    await fixture.whenStable();
    expect(router.url).toBe('/login');
  });

  it('does not restore permissions from a session response received after expiration', () => {
    const auth = TestBed.inject(AuthService);
    auth.cargarSesion().subscribe();
    auth.notificarSesionExpirada();
    TestBed.inject(HttpTestingController)
      .expectOne((req) => req.url.endsWith('/auth/sesion'))
      .flush({ permisos: ['empleados.ver'] });
    expect(auth.sesion()).toBeNull();
    expect(auth.permisos().size).toBe(0);
  });
});
