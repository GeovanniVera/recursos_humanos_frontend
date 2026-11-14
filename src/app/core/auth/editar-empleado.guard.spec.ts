import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { editarEmpleadoGuard, puedeEditarEmpleado } from './editar-empleado.guard';

/**
 * E-04: who may edit a record.
 *
 * The guard no longer protects a route — the edition is a drawer of the roster —
 * but `puedeEditarEmpleado` still decides whether the pencil of a row is offered,
 * so the rule keeps its own tests instead of living inside a screen.
 */
describe('Edition authorization', () => {
  it.each(['ADMIN', 'SUPER_ADMIN', 'SISTEMAS'])('allows E-04 role %s', (rol) => {
    expect(puedeEditarEmpleado(rol)).toBe(true);
  });

  it.each(['SECRETARIA', 'SECRETARIA_CIRCULARES', null])(
    'denies role %s and redirects direct URLs',
    (rol) => {
      TestBed.configureTestingModule({
        providers: [provideRouter([]), { provide: AuthService, useValue: { rol: () => rol } }],
      });
      const result = TestBed.runInInjectionContext(() =>
        editarEmpleadoGuard({} as never, {} as never),
      );
      expect(result).not.toBe(true);
      expect(String(result)).toBe('/empleados/activos');
    },
  );
});
