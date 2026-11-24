import { ComponentFixture, TestBed } from '@angular/core/testing';
import { claveEtiqueta } from '../../core/bitacora/bitacora-etiquetas.service';
import { BitacoraDetalle } from '../../core/bitacora/bitacora.models';
import { BitacoraDetalleDrawerComponent } from './bitacora-detalle-drawer.component';

function detalleBase(overrides: Partial<BitacoraDetalle> = {}): BitacoraDetalle {
  return {
    id: 481,
    fecha: '2026-11-18T18:42:11+00:00',
    usuario_id: 12,
    usuario_historico: 'Ana López',
    accion: 'empleado.baja',
    modulo: 'expediente',
    descripcion: 'Baja definitiva del trabajador 1002.',
    ip: '10.0.0.8',
    datos_antes: { estatus: 'activo' },
    datos_despues: { estatus: 'baja_definitiva' },
    ...overrides,
  };
}

describe('BitacoraDetalleDrawerComponent', () => {
  let fixture: ComponentFixture<BitacoraDetalleDrawerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BitacoraDetalleDrawerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(BitacoraDetalleDrawerComponent);
  });

  it('muestra estado 404 con opción de recargar listado', async () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('falla', {
      status: 404,
      mensaje: 'El movimiento ya no existe.',
      codigo: 'no_encontrado',
      accion: 'recargar',
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('El movimiento ya no existe.');
    expect(text).toContain('Recargar listado');
  });

  it('muestra "Sin datos" cuando los snapshots son nulos', async () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput(
      'detalle',
      detalleBase({ datos_antes: null, datos_despues: null }),
    );
    fixture.detectChanges();
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Sin datos');
  });

  it('muestra snapshots en tablas legibles y metadatos', async () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput(
      'detalle',
      detalleBase({
        ip: null,
        datos_antes: { estatus: 'activo', num_empleado: 1002 },
        datos_despues: { estatus: 'baja_definitiva', observaciones: null },
        usuario_id: null,
      }),
    );
    fixture.detectChanges();
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Campo');
    expect(text).toContain('Valor');
    expect(text).toContain('Estado');
    expect(text).toContain('Activo');
    expect(text).toContain('Baja definitiva');
    expect(text).toContain('Número de empleado');
    expect(text).toContain('1,002');
    expect(text).toContain('Observaciones');
    expect(text).toContain('Sin información');
    expect(text).toContain('No registrada');
    expect(text).toContain('Sistema');
    // El detalle humaniza el identificador técnico de la acción y del módulo.
    expect(text).toContain('Baja');
    expect(text).toContain('Expediente');
  });

  it('muestra al usuario sin el identificador', async () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('detalle', detalleBase());
    fixture.detectChanges();
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Ana López');
    expect(text).not.toContain('ID 12');
  });

  it('muestra el correo del usuario en lugar de su ID', async () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('detalle', detalleBase({ correo: 'ana.lopez@utn.edu.mx' }));
    fixture.detectChanges();
    await fixture.whenStable();

    const raiz = fixture.nativeElement as HTMLElement;
    const text = raiz.textContent ?? '';
    expect(text).toContain('Correo');
    expect(text).toContain('ana.lopez@utn.edu.mx');
    expect(text).toContain('Ana López');
    expect(text).not.toContain('ID 12');
    const valores = Array.from(raiz.querySelectorAll('.ficha .campo')).map((campo) =>
      campo.textContent?.trim(),
    );
    expect(valores).toContain('Correoana.lopez@utn.edu.mx');
  });

  it('muestra nombres en vez de los IDs de los snapshots', async () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput(
      'detalle',
      detalleBase({
        datos_antes: { empleado_id: 446, estatus: 'activo' },
        datos_despues: { estado_civil_id: 4 },
      }),
    );
    fixture.componentRef.setInput('etiquetas', {
      [claveEtiqueta('empleado_id', 446)]: 'María Rodríguez',
      [claveEtiqueta('estado_civil_id', 4)]: 'Divorciado',
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('María Rodríguez');
    expect(text).toContain('Divorciado');
    expect(text).not.toContain('Estado civil id');
    expect(text).not.toContain('Empleado id');
  });

  it('no repite la misma etiqueta cuando vienen el ID y su descripción', async () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput(
      'detalle',
      detalleBase({
        datos_antes: { empleado_id: 446, estado_civil_id: 4, estado_civil: 'Casado' },
        datos_despues: { empleado_id: 446, estado_civil_id: 5, estado_civil: 'Viudo' },
      }),
    );
    fixture.componentRef.setInput('etiquetas', {
      [claveEtiqueta('empleado_id', 446)]: 'Jorge Campos',
      [claveEtiqueta('estado_civil_id', 4)]: 'Casado',
      [claveEtiqueta('estado_civil_id', 5)]: 'Viudo',
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const raiz = fixture.nativeElement as HTMLElement;
    const etiquetas = Array.from(raiz.querySelectorAll('.snapshot-table tbody th')).map((celda) =>
      celda.textContent?.trim(),
    );
    expect(etiquetas.filter((valor) => valor === 'Estado civil').length).toBe(2);
    expect(etiquetas.filter((valor) => valor === 'Empleado').length).toBe(2);

    const texto = raiz.textContent ?? '';
    expect(texto.match(/Casado/g)?.length).toBe(1);
    expect(texto.match(/Viudo/g)?.length).toBe(1);
  });
});
