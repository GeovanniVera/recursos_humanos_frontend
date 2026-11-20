import { ComponentFixture, TestBed } from '@angular/core/testing';
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
    fixture.componentRef.setInput('detalle', detalleBase({ datos_antes: null, datos_despues: null }));
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
  });
});
