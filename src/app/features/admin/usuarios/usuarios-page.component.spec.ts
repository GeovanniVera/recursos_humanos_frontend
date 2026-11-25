import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/auth/auth.service';
import { UsuariosPage } from './usuarios-page.component';

describe('UsuariosPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UsuariosPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            rol: () => 'SUPER_ADMIN',
            permisos: () => new Set(['usuarios.ver', 'usuarios.crear', 'usuarios.editar', 'usuarios.cambiar_estado', 'roles.gestionar']),
            tienePermiso: () => true,
          },
        },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loads users, roles and permissions catalog on init', async () => {
    const fixture = TestBed.createComponent(UsuariosPage);
    fixture.detectChanges();

    httpMock.expectOne(`${environment.apiBaseUrl}/usuarios`).flush({
      datos: [
        {
          id: 1,
          activo: true,
          fecha_registro: null,
          editable: true,
          empleado: {
            id: 10,
            num_empleado: 'UTN-01',
            nombre: 'Ana Admin',
            correo: 'ana@utn.edu.mx',
            area: 'RH',
            estatus: 'activo',
          },
          rol: { id: 3, clave: 'ADMIN', nombre: 'Administrador RH', nivel: 50, es_sistema: false },
        },
      ],
      meta: { pagina_actual: 1, ultima_pagina: 1, por_pagina: 20, total: 1 },
    });

    httpMock.expectOne(`${environment.apiBaseUrl}/roles`).flush({
      datos: [
        {
          id: 3,
          clave: 'ADMIN',
          nombre: 'Administrador RH',
          descripcion: 'Admin',
          nivel: 50,
          es_sistema: false,
          activo: true,
          usuarios_count: 1,
          editable: true,
          permisos: [{ permiso_id: 1, clave: 'empleados.ver', alcance: 'todos', campos_permitidos: null }],
        },
      ],
    });

    httpMock.expectOne(`${environment.apiBaseUrl}/permisos`).flush({
      datos: [
        {
          id: 1,
          clave: 'empleados.ver',
          recurso: 'empleados',
          accion: 'ver',
          descripcion: 'Ver empleados',
          alcances_soportados: ['todos', 'propio'],
          asignable: true,
        },
      ],
    });

    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Ana Admin');
    expect(text).toContain('ana@utn.edu.mx');
  });
});
