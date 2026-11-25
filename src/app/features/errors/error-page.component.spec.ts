import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ErrorCode, ErrorPage } from './error-page.component';

describe('ErrorPage', () => {
  async function createWithCode(code?: ErrorCode): Promise<ComponentFixture<ErrorPage>> {
    await TestBed.configureTestingModule({
      imports: [ErrorPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { data: { code } },
            data: of({ code }),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ErrorPage);
    await fixture.whenStable();
    return fixture;
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders 404 copy and /errors/404.png by default', async () => {
    const fixture = await createWithCode(undefined);
    const el = fixture.nativeElement as HTMLElement;
    const img = el.querySelector<HTMLImageElement>('img.error-illustration');

    expect(el.textContent).toContain('Error 404');
    expect(el.textContent).toContain('No encontramos la ruta que buscas');
    expect(img?.getAttribute('src')).toBe('/errors/404.png');
  });

  it('renders 403 copy and /errors/403.png', async () => {
    const fixture = await createWithCode('403');
    const el = fixture.nativeElement as HTMLElement;
    const img = el.querySelector<HTMLImageElement>('img.error-illustration');

    expect(el.textContent).toContain('Error 403');
    expect(el.textContent).toContain('No tienes permisos para ver esta sección');
    expect(img?.getAttribute('src')).toBe('/errors/403.png');
  });

  it('renders 500 copy and /errors/500.png', async () => {
    const fixture = await createWithCode('500');
    const el = fixture.nativeElement as HTMLElement;
    const img = el.querySelector<HTMLImageElement>('img.error-illustration');

    expect(el.textContent).toContain('Error 500');
    expect(el.textContent).toContain('Ocurrió un problema en el servidor');
    expect(img?.getAttribute('src')).toBe('/errors/500.png');
  });

  it('navigates to / when clicking Ir al panel', async () => {
    const fixture = await createWithCode('404');
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const btn = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ).find((b) => (b.textContent ?? '').includes('Ir al panel'));

    btn?.click();
    expect(navSpy).toHaveBeenCalledWith(['/']);
  });
});
