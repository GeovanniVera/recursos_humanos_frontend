import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, provideRouter } from '@angular/router';
import { routes } from './app.routes';

@Component({ selector: 'app-route-stub', template: '' })
class RouteStub {}

/**
 * Shape of the route tree for the employees branch.
 *
 * The branch used to be three screens — an index, the roster and a placeholder
 * for the baja listing — under a componentless parent. It is one screen now, so
 * this suite locks the shape: one destination and the old addresses as
 * redirects. A regression here is invisible until somebody follows a bookmark.
 */
describe('app.routes · empleados', () => {
  /** Children of the authenticated shell, which is the only guarded branch. */
  function shellChildren(): readonly Route[] {
    const shell = routes.find((route) => route.path === '' && route.children !== undefined);
    if (shell?.children === undefined) {
      throw new Error('No shell route with children');
    }
    return shell.children;
  }

  it('serves the listing at /empleados, with the breadcrumb that follows the tab', () => {
    const empleados = shellChildren().filter((route) => route.path === 'empleados');

    expect(empleados).toHaveLength(1);
    const [listing] = empleados;
    expect(listing.redirectTo).toBeUndefined();
    expect(listing.loadComponent).toBeTypeOf('function');

    // The trail resolves the pressed tab through this map; without it the step
    // would stay on the default view while the sheet lists another one.
    const byEstatus = listing.data?.['breadcrumbByEstatus'];
    expect(Object.keys(byEstatus ?? {})).toEqual([
      'todos',
      'activo',
      'licencia',
      'baja_definitiva',
    ]);
    expect(listing.data?.['breadcrumb']).toBe(byEstatus['activo']);
  });

  it('redirects every old address of the branch to the single screen', () => {
    const legacy = shellChildren()
      .filter((route) => route.redirectTo === 'empleados')
      .map((route) => route.path);

    expect(legacy).toEqual([
      'empleados/activos',
      'empleados/baja',
      'empleados/alta',
      'empleados/:id/editar',
    ]);

    // Every redirect claims its whole URL: a prefix match would swallow a child
    // segment that belongs to some future route.
    for (const path of legacy) {
      const route = shellChildren().find((candidate) => candidate.path === path);
      expect(route?.pathMatch).toBe('full');
    }
  });

  it('leaves no second listing behind: every other empleados path is a redirect', () => {
    const branch = shellChildren().filter((route) => route.path?.startsWith('empleados'));

    expect(branch.map((route) => route.path)).toEqual([
      'empleados',
      'empleados/activos',
      'empleados/baja',
      'empleados/alta',
      'empleados/:id/editar',
    ]);

    // The baja listing is a tab of the one screen, not a destination of its own.
    for (const route of branch.slice(1)) {
      expect(route.loadComponent).toBeUndefined();
      expect(route.redirectTo).toBe('empleados');
    }
  });

  it('keeps the query when an old address redirects to the single screen', async () => {
    // Same declarations as the real tree, with the target stubbed: what is under
    // test is the framework's redirect, not the listing it opens.
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'empleados', component: RouteStub },
          { path: 'empleados/activos', pathMatch: 'full', redirectTo: 'empleados' },
          { path: 'empleados/baja', pathMatch: 'full', redirectTo: 'empleados' },
        ]),
      ],
    });
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/empleados/activos?estatus=licencia');
    // A bookmark of the old roster still opens the tab it named.
    expect(router.url).toBe('/empleados?estatus=licencia');

    await router.navigateByUrl('/empleados/baja');
    expect(router.url).toBe('/empleados');
  });
});

describe('app.routes · bitácora', () => {
  function shellChildren(): readonly Route[] {
    const shell = routes.find((route) => route.path === '' && route.children !== undefined);
    if (shell?.children === undefined) {
      throw new Error('No shell route with children');
    }
    return shell.children;
  }

  it('declares /bitacora with breadcrumb and lazy component', () => {
    const route = shellChildren().find((child) => child.path === 'bitacora');

    expect(route).toBeDefined();
    expect(route?.data?.['breadcrumb']).toBe('Bitácora');
    expect(route?.loadComponent).toBeTypeOf('function');
  });
});
