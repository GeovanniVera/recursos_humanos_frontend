import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { AltaPage } from './alta-page.component';
import { HistorialCampo } from './historial-campo.component';
import { CAMPOS_EDITABLES } from '../../../core/empleados/editar.service';
import { AuthService } from '../../../core/auth/auth.service';
import { editarEmpleadoGuard, puedeEditarEmpleado } from '../../../core/auth/editar-empleado.guard';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { FichaEmpleado } from '../../../core/empleados/ficha.models';

const URL = `${environment.apiBaseUrl}/empleados`;
const ficha: FichaEmpleado = {
  id: 17,
  identificacion: {
    num_empleado: 'US08-17',
    nombre: 'Prueba US08',
    curp: 'LEGADO',
    fecha_nacimiento: null,
    sexo: null,
    estado_civil_id: null,
    estado_civil: null,
    entidad_nacimiento: null,
  },
  plaza: {
    area_id: null,
    area: null,
    puesto_id: null,
    puesto: null,
    tipo_puesto: null,
    categoria_cct_id: 99,
    categoria_cct_clave: 'CAT-HISTORICA',
    tipo_personal: null,
    tipo_jornada: null,
    fecha_inicio_puesto: null,
    fecha_ingreso_institucion: null,
    fecha_ingreso_gobierno: null,
    antiguedad: { anios: 0, meses: 0, dias: 0, texto: 'Sin dato' },
  },
  contacto: { correo_institucional: 'legado' },
  estudios: {
    nivel_estudios_id: null,
    nivel_estudios: null,
    escuela_procedencia: 'Anterior',
    generacion: '2010-2014',
  },
  experiencia: {
    exp_publico_anios: 0,
    exp_privado_anios: 0,
    trabaja_otro_lugar: 'No',
    trabaja_otro_donde: null,
  },
  gestion_interna: {
    activo: true,
    fecha_baja: null,
    motivo_baja: null,
    nota_baja: null,
    observaciones: null,
    estado_expediente: { estado: 'incompleto', total_faltantes: 4, campos_faltantes: [] },
  },
};
const catalogos = {
  areas: [],
  puestos: [],
  categorias_cct: [],
  niveles_estudios: [],
  estados_civiles: [{ id: 1, clave: 'SOL', descripcion: 'Soltero' }],
  tipos_personal: [],
  sexos: [],
  entidades: [],
  tipos_jornada: [],
  trabaja_otro_lugar: ['No', 'Publico', 'Privado'],
};

describe('US-08 reuses AltaPage in edition mode', () => {
  let fixture: ComponentFixture<AltaPage>;
  let http: HttpTestingController;
  const root = () => fixture.nativeElement as HTMLElement;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AltaPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: '17' }) } },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AltaPage);
  });
  afterEach(() => http.verify());
  async function cargar() {
    http.expectOne(`${URL}/formulario`).flush(catalogos);
    http.expectOne(`${URL}/17`).flush({ data: ficha });
    await fixture.whenStable();
  }
  it('loads the current record and catalogs once, protects identification and keeps civil editable', async () => {
    expect(fixture.componentInstance.cargando()).toBe(true);
    await cargar();
    expect(root().textContent).toContain('Editar empleado');
    expect((root().querySelector('#nombre') as HTMLInputElement).value).toBe('Prueba US08');
    for (const k of [
      'nombre',
      'num_empleado',
      'curp',
      'correo_institucional',
      'fecha_nacimiento',
    ]) {
      expect((root().querySelector('#' + k) as HTMLInputElement).readOnly).toBe(true);
    }
    expect((root().querySelector('#estado_civil_id') as HTMLSelectElement).disabled).toBe(false);
    fixture.componentInstance.guardar('nombre', 'No permitido');
    expect(fixture.componentInstance.modelo().nombre).toBe('Prueba US08');
    expect(fixture.componentInstance.puedeContinuar()).toBe(true); // invalid protected legacy data is not revalidated
  });
  it('shows every plaza field read-only, including empty catalog values', async () => {
    await cargar();
    fixture.componentInstance.paso.set(1);
    await fixture.whenStable();
    for (const e of root().querySelectorAll<HTMLInputElement>('.group input'))
      expect(e.readOnly).toBe(true);
    expect(root().querySelector('.group select')).toBeNull();
    expect(root().textContent).toContain('CAT-HISTORICA');
    expect(root().textContent).not.toContain('Error');
  });
  it('enables studies and experience', async () => {
    await cargar();
    fixture.componentInstance.paso.set(2);
    await fixture.whenStable();
    for (const k of [
      'escuela_procedencia',
      'generacion',
      'exp_publico_anios',
      'exp_privado_anios',
    ]) {
      expect((root().querySelector('#' + k) as HTMLInputElement).readOnly).toBe(false);
    }
    expect(root().querySelector('form form')).toBeNull();
  });
  it('mounts one read-only history panel and reads its field only when expanded', async () => {
    await cargar();
    fixture.componentInstance.paso.set(2);
    await fixture.whenStable();

    expect(root().querySelectorAll('app-historial-campo')).toHaveLength(1);
    const panel = fixture.debugElement.query(By.directive(HistorialCampo))
      .componentInstance as HistorialCampo;
    expect(panel.campo()).toBe('nivel_estudios_id');
    expect(root().textContent).toContain('Niveles de estudios ya registrados');
    http.expectNone((r) => r.url.includes('informacion-historial'));

    panel.alternar({ target: { open: true } } as unknown as Event);
    await fixture.whenStable();
    const req = http.expectOne((r) => r.url === `${URL}/17/informacion-historial`);
    expect(req.request.params.get('campo')).toBe('nivel_estudios_id');
    expect(req.request.params.get('por_pagina')).toBe('5');
    req.flush({ datos: [], meta: { pagina: 1, por_pagina: 5, total: 0, total_paginas: 1 } });
    await fixture.whenStable();
    expect(root().textContent).toContain('Sin cambios registrados.');
  });
  it('sends only the allowlist, prevents duplicate submissions and confirms success', async () => {
    await cargar();
    fixture.componentInstance.guardar('estado_civil_id', 1);
    fixture.componentInstance.guardar('escuela_procedencia', 'Nueva');
    fixture.componentInstance.paso.set(3);
    await fixture.whenStable();
    expect(root().textContent).toContain('Guardar Empleado');
    const toast = vi.spyOn(TestBed.inject(ToastService), 'show');
    const navigation = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.componentInstance.registrar();
    fixture.componentInstance.registrar();
    const req = http.expectOne(`${URL}/17`);
    expect(req.request.method).toBe('PATCH');
    expect(Object.keys(req.request.body).sort()).toEqual([...CAMPOS_EDITABLES].sort());
    expect(req.request.body.nombre).toBeUndefined();
    expect(req.request.body.area_id).toBeUndefined();
    expect(req.request.body.escuela_procedencia).toBe('Nueva');
    expect(req.request.body.observaciones).toBeNull();
    req.flush({ data: ficha });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Empleado actualizado correctamente.' }),
    );
    expect(navigation).toHaveBeenCalledWith(['/empleados/activos']);
    expect(fixture.componentInstance.registroActual()?.id).toBe(ficha.id);
  });
  it('validates generation and maps server validation without losing entered changes', async () => {
    await cargar();
    fixture.componentInstance.guardar('generacion', '2020');
    fixture.componentInstance.registrar();
    http.expectNone((r) => r.method === 'PATCH');
    expect(fixture.componentInstance.paso()).toBe(2);
    await fixture.whenStable();
    fixture.componentInstance.guardar('generacion', '2020-2024');
    fixture.componentInstance.registrar();
    http
      .expectOne(`${URL}/17`)
      .flush(
        { message: 'Datos inválidos', errors: { generacion: ['Revisa la generación.'] } },
        { status: 422, statusText: 'Unprocessable' },
      );
    expect(fixture.componentInstance.modelo().generacion).toBe('2020-2024');
    expect(fixture.componentInstance.enviando()).toBe(false);
    expect(fixture.componentInstance.errorDe('generacion')).toBe('Revisa la generación.');
  });
  it('does not enable saving when preload fails', async () => {
    http.expectOne(`${URL}/formulario`).flush(catalogos);
    http.expectOne(`${URL}/17`).flush({}, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    expect(fixture.componentInstance.errorCatalogos()).not.toBeNull();
    fixture.componentInstance.registrar();
    http.expectNone((r) => r.method === 'PATCH');
  });
});

describe('US-08 route authorization', () => {
  it.each(['ADMIN', 'SUPER_ADMIN', 'SISTEMAS'])('allows E-04 role %s', (rol) =>
    expect(puedeEditarEmpleado(rol)).toBe(true),
  );
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
