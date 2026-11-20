import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, model, output } from '@angular/core';
import {
  claveEtiqueta,
  EtiquetasSnapshot,
} from '../../core/bitacora/bitacora-etiquetas.service';
import { BitacoraDetalle } from '../../core/bitacora/bitacora.models';
import { Drawer } from '../../shared/ui/drawer/drawer.component';

export interface FallaDetalleVista {
  status: number;
  mensaje: string;
  codigo: string | null;
  accion: 'reintentar' | 'ninguna' | 'recargar';
}

type ValorLegible =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'lista'; items: ValorLegible[] }
  | { tipo: 'tabla'; filas: Array<{ etiqueta: string; valor: ValorLegible }> };

export interface EntradaSnapshot {
  etiqueta: string;
  valor: ValorLegible;
}

interface SelloVista {
  texto: string;
  tono: 'ok' | 'aviso' | 'mal';
}

const FORMATO_FECHA = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Mexico_City',
});

const FORMATO_FECHA_CORTA = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'long',
  timeZone: 'America/Mexico_City',
});

const FORMATO_NUMERO = new Intl.NumberFormat('es-MX');

const ETIQUETAS_CAMPOS: Record<string, string> = {
  id: 'Identificador',
  usuario_id: 'Usuario',
  usuario_historico: 'Usuario',
  nombre: 'Nombre',
  nombres: 'Nombre(s)',
  apellido_paterno: 'Apellido paterno',
  apellido_materno: 'Apellido materno',
  num_empleado: 'Número de empleado',
  empleado_id: 'Empleado',
  estatus: 'Estado',
  status: 'Estado',
  activo: 'Activo',
  descripcion: 'Descripción',
  motivo: 'Motivo',
  motivo_baja: 'Motivo de baja',
  fecha: 'Fecha',
  fecha_baja: 'Fecha de baja',
  fecha_ingreso: 'Fecha de ingreso',
  fecha_inicio: 'Fecha de inicio',
  fecha_fin: 'Fecha de fin',
  area: 'Área',
  area_id: 'Área',
  puesto: 'Puesto',
  puesto_id: 'Puesto',
  categoria: 'Categoría',
  categoria_id: 'Categoría',
  modulo: 'Módulo',
  accion: 'Acción',
  ip: 'Dirección IP',
  correo: 'Correo',
  correo_institucional: 'Correo institucional',
  telefono: 'Teléfono',
  curp: 'CURP',
  rfc: 'RFC',
  observaciones: 'Observaciones',
  comentario: 'Comentario',
  comentarios: 'Comentarios',
  rol: 'Rol',
  permisos: 'Permisos',
  created_at: 'Fecha de creación',
  updated_at: 'Fecha de actualización',
};

const ETIQUETAS_ACCIONES: Record<string, string> = {
  alta: 'Alta',
  baja: 'Baja',
  creacion: 'Creación',
  edicion: 'Edición',
  actualizacion: 'Actualización',
  modificacion: 'Modificación',
  eliminacion: 'Eliminación',
  reactivacion: 'Reactivación',
  reingreso: 'Reingreso',
  restauracion: 'Restauración',
  cambio: 'Cambio',
  consulta: 'Consulta',
};

@Component({
  selector: 'app-bitacora-detalle-drawer',
  imports: [Drawer, NgTemplateOutlet],
  templateUrl: './bitacora-detalle-drawer.component.html',
  styleUrl: './bitacora-detalle-drawer.component.scss',
})
export class BitacoraDetalleDrawerComponent {
  readonly open = model(false);
  readonly cargando = input(false);
  readonly detalle = input<BitacoraDetalle | null>(null);
  readonly falla = input<FallaDetalleVista | null>(null);
  readonly esperaActiva = input(false);

  readonly reintentar = output<void>();
  readonly recargarListado = output<void>();
  readonly cerrado = output<void>();

  readonly titulo = computed(() => {
    const d = this.detalle();
    if (!d) return 'Detalle del movimiento';
    return `Movimiento #${d.id}`;
  });

  formatearFecha(valor: string): string {
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return valor;
    return FORMATO_FECHA.format(fecha);
  }

  entradasSnapshot(valor: Record<string, unknown> | null): EntradaSnapshot[] | null {
    if (valor === null) return null;
    return Object.entries(valor).map(([campo, contenido]) => ({
      etiqueta: this.etiquetaCampo(campo),
      valor: this.valorLegible(contenido, campo),
    }));
  }

  private etiquetaCampo(campo: string): string {
    const directa = ETIQUETAS_CAMPOS[campo];
    if (directa) return directa;
    const normalizado = campo
      .replace(/_/g, ' ')
      .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
      .trim();
    if (!normalizado) return 'Campo';
    return normalizado.charAt(0).toUpperCase() + normalizado.slice(1);
  }

  private valorLegible(valor: unknown, campo?: string): ValorLegible {
    if (valor === null || valor === undefined) {
      return { tipo: 'texto', texto: 'Sin información' };
    }
    if (typeof valor === 'boolean') {
      return { tipo: 'texto', texto: valor ? 'Sí' : 'No' };
    }
    if (typeof valor === 'number') {
      if (!Number.isFinite(valor)) return { tipo: 'texto', texto: 'Sin información' };
      if (campo && /(^id$|_id$)/.test(campo)) return { tipo: 'texto', texto: String(valor) };
      return { tipo: 'texto', texto: FORMATO_NUMERO.format(valor) };
    }
    if (typeof valor === 'string') {
      const texto = valor.trim();
      if (texto === '') return { tipo: 'texto', texto: 'Sin información' };
      const fecha = this.formatearTextoFecha(texto);
      if (fecha) return { tipo: 'texto', texto: fecha };
      return { tipo: 'texto', texto: this.humanizarTexto(texto, campo) };
    }
    if (Array.isArray(valor)) {
      if (valor.length === 0) return { tipo: 'texto', texto: 'Sin información' };
      return { tipo: 'lista', items: valor.map((item) => this.valorLegible(item)) };
    }
    if (typeof valor === 'object') {
      const entradas = Object.entries(valor as Record<string, unknown>);
      if (entradas.length === 0) return { tipo: 'texto', texto: 'Sin información' };
      return {
        tipo: 'tabla',
        filas: entradas.map(([k, v]) => ({
          etiqueta: this.etiquetaCampo(k),
          valor: this.valorLegible(v, k),
        })),
      };
    }
    return { tipo: 'texto', texto: String(valor) };
  }

  private formatearTextoFecha(valor: string): string | null {
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
      const d = new Date(`${valor}T00:00:00`);
      return Number.isNaN(d.getTime()) ? null : FORMATO_FECHA_CORTA.format(d);
    }
    // ISO datetime
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(valor)) {
      const d = new Date(valor);
      return Number.isNaN(d.getTime()) ? null : FORMATO_FECHA.format(d);
    }
    return null;
  }

  private humanizarTexto(valor: string, campo?: string): string {
    if (campo === 'estatus' || campo === 'status' || campo === 'estado') {
      return this.etiquetaEstado(valor);
    }
    // Si es un identificador con guiones bajos/puntos (p.ej. empleado.baja, baja_definitiva), hacerlo legible
    if (/^[a-z0-9._-]+$/i.test(valor) && /[._-]/.test(valor)) {
      const partes = valor.split(/[._-]+/).filter(Boolean);
      if (partes.length > 1) {
        const frase = partes.join(' ');
        return frase.charAt(0).toUpperCase() + frase.slice(1);
      }
    }
    return valor;
  }

  private etiquetaEstado(valor: string): string {
    const mapa: Record<string, string> = {
      activo: 'Activo',
      activa: 'Activa',
      inactivo: 'Inactivo',
      inactiva: 'Inactiva',
      baja: 'Baja',
      baja_definitiva: 'Baja definitiva',
      licencia: 'Licencia',
      suspendido: 'Suspendido',
      suspendida: 'Suspendida',
      pendiente: 'Pendiente',
      completado: 'Completado',
      completada: 'Completada',
    };
    return mapa[valor] ?? this.humanizarTexto(valor);
  }

  actorLabel(detalle: BitacoraDetalle): string {
    return detalle.usuario_id === null
      ? `${detalle.usuario_historico} · Sistema`
      : detalle.usuario_historico;
  }

  usuarioLabel(detalle: BitacoraDetalle): string {
    if (detalle.usuario_id === null) return 'Sistema';
    const nombre = detalle.usuario_historico.trim();
    return nombre ? `${nombre} · ID ${detalle.usuario_id}` : `ID ${detalle.usuario_id}`;
  }

  ipLabel(detalle: BitacoraDetalle): string {
    return detalle.ip ?? 'No registrada';
  }

  accionLabel(detalle: BitacoraDetalle): string {
    const clave = this.claveAccion(detalle);
    return ETIQUETAS_ACCIONES[clave] ?? this.humanizarTexto(clave, 'accion');
  }

  moduloLabel(detalle: BitacoraDetalle): string {
    const modulo = detalle.modulo.trim();
    if (!modulo) return 'Sin módulo';
    const legible = this.humanizarTexto(modulo, 'modulo');
    return legible.charAt(0).toUpperCase() + legible.slice(1);
  }

  // The seal repeats the act in one word: a termination is stamped in red, an
  // alta or a reingreso in green, and every other movement in the amber of a
  // leave, so the tone never invents a state the movement does not have.
  sello(detalle: BitacoraDetalle): SelloVista {
    const clave = this.claveAccion(detalle);
    const tono: SelloVista['tono'] = /baja|elimin|borr|anul/.test(clave)
      ? 'mal'
      : /alta|crea|registr|reactiv|reingres|restaur/.test(clave)
        ? 'ok'
        : 'aviso';
    return { texto: this.accionLabel(detalle), tono };
  }

  private claveAccion(detalle: BitacoraDetalle): string {
    return (detalle.accion.split('.').pop() ?? detalle.accion).trim().toLowerCase();
  }

  onOpenChange(valor: boolean): void {
    this.open.set(valor);
    if (!valor) {
      this.cerrado.emit();
    }
  }
}
