import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Topbar } from './topbar.component';

@Component({ selector: 'app-test-leaf', template: '' })
class TestLeaf {}

describe('Topbar', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Topbar],
      providers: [
        provideRouter([
          {
            path: '',
            children: [
              { path: '', data: { breadcrumb: 'Panel general' }, component: TestLeaf },
              {
                path: 'semaforo-documentos',
                data: { breadcrumb: 'Semáforo de documentos' },
                component: TestLeaf,
              },
              {
                path: 'empleados',
                // Componentless branch: it only contributes a breadcrumb step.
                data: { breadcrumb: 'Empleados' },
                children: [
                  {
                    path: 'activos',
                    data: { breadcrumb: 'Empleados activos' },
                    component: TestLeaf,
                  },
                ],
              },
            ],
          },
        ]),
      ],
    }).compileComponents();
  });

  function labels(element: HTMLElement): string[] {
    return Array.from(element.querySelectorAll('.crumb')).map((crumb) =>
      (crumb.textContent ?? '').trim(),
    );
  }

  it('builds the trail from the route tree and links every ancestor', async () => {
    const fixture = TestBed.createComponent(Topbar);
    await TestBed.inject(Router).navigateByUrl('/empleados/activos');
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(labels(element)).toEqual(['Inicio', 'Empleados', 'Empleados activos']);

    const links = Array.from(element.querySelectorAll<HTMLAnchorElement>('.crumb.is-link'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/', '/empleados']);

    // The last step is the page you are on: text, never a link.
    const current = element.querySelector<HTMLElement>('.crumb.is-current');
    expect(current?.textContent?.trim()).toBe('Empleados activos');
    expect(current?.getAttribute('aria-current')).toBe('page');
  });

  it('hides the home step when it would link to the current page', async () => {
    const fixture = TestBed.createComponent(Topbar);
    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(labels(element)).toEqual(['Panel general']);
    expect(element.querySelector('.crumb.is-link')).toBeNull();
  });

  it('renders a semantic clock', async () => {
    const fixture = TestBed.createComponent(Topbar);
    await fixture.whenStable();

    const clock = (fixture.nativeElement as HTMLElement).querySelector('time');
    expect(clock?.textContent).toMatch(/\d{1,2}:\d{2}\s(AM|PM) · \p{Lu}/u);
    expect(clock?.getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('no longer offers the new-record action', async () => {
    const fixture = TestBed.createComponent(Topbar);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    // The dialog behind it never existed; the bar is navigation only now.
    expect(element.querySelector('button')).toBeNull();
    expect(element.textContent).not.toContain('Nuevo');
  });
});
