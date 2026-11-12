import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { PlaceholderPage } from './placeholder-page.component';

/** Stands in for the router: the screen only reads the resolved `data`. */
function routeWith(data: Record<string, unknown>) {
  return { provide: ActivatedRoute, useValue: { data: of(data) } };
}

describe('PlaceholderPage', () => {
  it('renders the heading and the copy declared by the route', async () => {
    await TestBed.configureTestingModule({
      imports: [PlaceholderPage],
      providers: [
        routeWith({
          titulo: 'Empleados baja',
          descripcion: 'El archivo histórico llega en la siguiente iteración.',
        }),
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PlaceholderPage);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('h1')?.textContent).toContain('Empleados baja');
    expect(compiled.querySelector('p')?.textContent).toContain('archivo histórico');
  });

  it('renders empty copy instead of undefined when the route declares no data', async () => {
    await TestBed.configureTestingModule({
      imports: [PlaceholderPage],
      providers: [routeWith({})],
    }).compileComponents();

    const fixture = TestBed.createComponent(PlaceholderPage);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('h1')?.textContent?.trim()).toBe('');
    expect(compiled.querySelector('p')?.textContent?.trim()).toBe('');
  });
});
