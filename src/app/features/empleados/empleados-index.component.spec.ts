import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EmpleadosIndex } from './empleados-index.component';

describe('EmpleadosIndex', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmpleadosIndex],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('lists the three sections of the branch as real links', async () => {
    const fixture = TestBed.createComponent(EmpleadosIndex);
    await fixture.whenStable();

    const links = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('a.section-link'),
    );

    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/empleados/activos',
      '/empleados/baja',
      '/semaforo-documentos',
    ]);
    expect(links[0].textContent).toContain('Empleados activos');
    expect(links[1].textContent).toContain('Empleados baja');
    expect(links[2].textContent).toContain('Semáforo de documentos');
  });

  it('does not render any listing of its own', async () => {
    const fixture = TestBed.createComponent(EmpleadosIndex);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    // The index navigates; the roster lives in its own screen.
    expect(element.querySelector('table')).toBeNull();
    expect(element.querySelector('app-data-table')).toBeNull();
  });
});
