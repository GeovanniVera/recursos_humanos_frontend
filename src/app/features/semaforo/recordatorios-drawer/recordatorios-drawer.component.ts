import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { finalize } from 'rxjs';
import {
  ActualizarConfigRecordatoriosPayload,
  ConfigRecordatoriosSemaforo,
  EnvioRecordatorioHistorial,
} from '../../../core/semaforo/semaforo.models';
import { SemaforoService } from '../../../core/semaforo/semaforo.service';
import { AlertBanner } from '../../../shared/ui/alert-banner/alert-banner.component';
import { Button } from '../../../shared/ui/button/button.component';
import { Drawer } from '../../../shared/ui/drawer/drawer.component';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { MailPreview } from '../../mensajeria/mail-preview/mail-preview.component';

type TabRecordatorios = 'configuracion' | 'historial';
type VistaPreviaEstado = 'incompleto' | 'casi_completo';

@Component({
  selector: 'app-recordatorios-drawer',
  imports: [FormsModule, AlertBanner, Button, Drawer, MailPreview],
  templateUrl: './recordatorios-drawer.component.html',
  styleUrl: './recordatorios-drawer.component.scss',
})
export class RecordatoriosDrawer {
  private readonly api = inject(SemaforoService);
  private readonly toast = inject(ToastService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly open = model(false);
  readonly config = input<ConfigRecordatoriosSemaforo | null>(null);
  readonly puedeConfigurar = input(true);
  readonly puedeVerHistorial = input(true);
  readonly configGuardada = output<ConfigRecordatoriosSemaforo>();

  protected readonly tab = signal<TabRecordatorios>('configuracion');
  protected readonly previewEstado = signal<VistaPreviaEstado>('incompleto');
  protected readonly mostrarPreview = signal(false);

  protected readonly activo = signal(true);
  protected readonly diasIncompleto = signal(2);
  protected readonly diasCasiCompleto = signal(5);
  protected readonly asuntoIncompleto = signal('');
  protected readonly mensajeIncompleto = signal('');
  protected readonly asuntoCasiCompleto = signal('');
  protected readonly mensajeCasiCompleto = signal('');

  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly historial = signal<EnvioRecordatorioHistorial[]>([]);
  protected readonly historialLoading = signal(false);
  protected readonly historialError = signal<string | null>(null);
  protected readonly historialPagina = signal(1);
  protected readonly historialTotalPaginas = signal(1);
  protected readonly historialFiltroEstado = signal<'' | 'incompleto' | 'casi_completo'>('');

  protected readonly previewSubject = computed(() =>
    this.previewEstado() === 'incompleto' ? this.asuntoIncompleto() : this.asuntoCasiCompleto(),
  );

  protected readonly previewBadge = computed(() =>
    this.previewEstado() === 'incompleto'
      ? 'Expediente Incompleto · Atención Prioritaria'
      : 'Expediente Casi Completo · Recordatorio',
  );

  protected readonly previewBodySafe = computed<SafeHtml>(() => {
    const raw =
      this.previewEstado() === 'incompleto' ? this.mensajeIncompleto() : this.mensajeCasiCompleto();
    const parrafos = raw
      .split(/\r?\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((p) => `<p>${this.escapeHtml(p)}</p>`)
      .join('');

    const porcentaje = this.previewEstado() === 'incompleto' ? '73.33%' : '86.67%';
    const faltantes =
      this.previewEstado() === 'incompleto'
        ? ['CURP', 'Entidad de nacimiento', 'Correo institucional', 'Fecha de ingreso al gobierno']
        : ['CURP', 'Correo institucional'];

    const listaHtml = `
      <div style="margin-top:16px;padding:12px 14px;border:1px solid #e5dec9;border-radius:8px;background:#faf8f5;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#5a0e24;">ESTADO DE TU EXPEDIENTE: ${porcentaje} completo (${faltantes.length} pendientes)</p>
        <ul style="margin:0;padding-left:18px;font-size:13px;">
          ${faltantes.map((item) => `<li>${item}</li>`).join('')}
        </ul>
      </div>
    `;

    return this.sanitizer.bypassSecurityTrustHtml(parrafos + listaHtml);
  });

  constructor() {
    effect(() => {
      const cfg = this.config();
      const abierto = this.open();
      if (cfg && abierto) {
        this.sincronizarFormulario(cfg);
        this.formError.set(null);
        if (!this.puedeConfigurar() && this.puedeVerHistorial()) {
          this.cambiarTab('historial');
        } else if (this.tab() === 'historial') {
          this.cargarHistorial(1);
        }
      }
    });
  }

  protected cambiarTab(tab: TabRecordatorios): void {
    this.tab.set(tab);
    if (tab === 'historial') {
      this.cargarHistorial(1);
    }
  }

  protected guardarConfiguracion(): void {
    if (this.saving()) return;

    const diasInc = Number(this.diasIncompleto());
    const diasCasi = Number(this.diasCasiCompleto());

    if (!Number.isInteger(diasInc) || diasInc < 1 || diasInc > 90) {
      this.formError.set('La frecuencia para expedientes incompletos debe estar entre 1 y 90 días.');
      return;
    }
    if (!Number.isInteger(diasCasi) || diasCasi < 1 || diasCasi > 90) {
      this.formError.set('La frecuencia para expedientes casi completos debe estar entre 1 y 90 días.');
      return;
    }

    const payload: ActualizarConfigRecordatoriosPayload = {
      activo: this.activo(),
      dias_incompleto: diasInc,
      dias_casi_completo: diasCasi,
      asunto_incompleto: this.asuntoIncompleto().trim(),
      mensaje_incompleto: this.mensajeIncompleto().trim(),
      asunto_casi_completo: this.asuntoCasiCompleto().trim(),
      mensaje_casi_completo: this.mensajeCasiCompleto().trim(),
    };

    if (
      payload.asunto_incompleto.length < 5 ||
      payload.mensaje_incompleto.length < 10 ||
      payload.asunto_casi_completo.length < 5 ||
      payload.mensaje_casi_completo.length < 10
    ) {
      this.formError.set('Completa el asunto y mensaje para ambos estados antes de guardar.');
      return;
    }

    this.formError.set(null);
    this.saving.set(true);

    this.api
      .actualizarConfigRecordatorios(payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (res) => {
          this.configGuardada.emit(res.datos);
          this.toast.show({
            type: 'success',
            title: 'Configuración guardada',
            message: `Automáticos ${res.datos.activo ? 'activos' : 'pausados'} (${res.datos.dias_incompleto}d incompletos · ${res.datos.dias_casi_completo}d casi completos).`,
          });
        },
        error: (err: unknown) => {
          this.formError.set(this.extraerMensajeError(err, 'No se pudo guardar la configuración.'));
        },
      });
  }

  protected cargarHistorial(pagina = 1): void {
    this.historialLoading.set(true);
    this.historialError.set(null);
    const filtro = this.historialFiltroEstado();

    this.api
      .consultarHistorialRecordatorios({
        estado_expediente: filtro === '' ? undefined : filtro,
        pagina,
        por_pagina: 10,
      })
      .pipe(finalize(() => this.historialLoading.set(false)))
      .subscribe({
        next: (res) => {
          this.historial.set(res.datos);
          this.historialPagina.set(res.meta.pagina);
          this.historialTotalPaginas.set(Math.max(1, res.meta.total_paginas));
        },
        error: (err: unknown) => {
          this.historialError.set(
            this.extraerMensajeError(err, 'No se pudo consultar el historial de envíos.'),
          );
        },
      });
  }

  protected alCambiarFiltroHistorial(valor: string): void {
    if (valor === 'incompleto' || valor === 'casi_completo' || valor === '') {
      this.historialFiltroEstado.set(valor);
      this.cargarHistorial(1);
    }
  }

  protected formatearFecha(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  }

  protected etiquetaOrigen(origen: EnvioRecordatorioHistorial['origen']): string {
    switch (origen) {
      case 'automatico':
        return 'Automático';
      case 'lote':
        return 'Lote manual';
      default:
        return 'Manual';
    }
  }

  private sincronizarFormulario(cfg: ConfigRecordatoriosSemaforo): void {
    this.activo.set(cfg.activo);
    this.diasIncompleto.set(cfg.dias_incompleto);
    this.diasCasiCompleto.set(cfg.dias_casi_completo);
    this.asuntoIncompleto.set(cfg.asunto_incompleto);
    this.mensajeIncompleto.set(cfg.mensaje_incompleto);
    this.asuntoCasiCompleto.set(cfg.asunto_casi_completo);
    this.mensajeCasiCompleto.set(cfg.mensaje_casi_completo);
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private extraerMensajeError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const msg = err.error?.message;
      if (typeof msg === 'string' && msg.trim().length > 0) {
        return msg;
      }
    }
    return fallback;
  }
}
