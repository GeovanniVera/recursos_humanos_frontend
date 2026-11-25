import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  ElementRef,
  SecurityContext,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import {
  MAX_ADJUNTOS_BYTES,
  VARIABLES_DINAMICAS,
  VariableDinamica,
  esRolAutorizador,
  formatFileSize,
  normalizarFichasEditorHtml,
  reemplazarVariablesHtmlPreview,
  reemplazarVariablesTexto,
} from '../../core/mensajeria/mensajeria-token.helper';
import {
  CategoriaCctTipo,
  ComunicadoArchivo,
  ComunicadoDto,
  DestinatarioMuestra,
  EmpleadoSegmento,
  FiltrosComunicado,
  GuardarComunicadoPayload,
  ModoDestinatarios,
  SegmentacionResumen,
} from '../../core/mensajeria/mensajeria.models';
import { MensajeriaService } from '../../core/mensajeria/mensajeria.service';
import { AlertBanner } from '../../shared/ui/alert-banner/alert-banner.component';
import { Button } from '../../shared/ui/button/button.component';
import { Drawer } from '../../shared/ui/drawer/drawer.component';
import { Modal } from '../../shared/ui/modal/modal.component';
import { PageHeader } from '../../shared/ui/page-header/page-header.component';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { MailPreview } from './mail-preview/mail-preview.component';
import { RichMailEditor } from './rich-mail-editor/rich-mail-editor.component';

@Component({
  selector: 'app-mensajeria-page',
  imports: [
    FormsModule,
    PageHeader,
    AlertBanner,
    Button,
    Drawer,
    Modal,
    MailPreview,
    RichMailEditor,
  ],
  templateUrl: './mensajeria-page.component.html',
  styleUrl: './mensajeria-page.component.scss',
})
export class MensajeriaPage {
  private readonly mensajeria = inject(MensajeriaService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly richEditorRef = viewChild(RichMailEditor);
  private readonly fileInputRef = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  readonly variablesDinamicas = VARIABLES_DINAMICAS;
  readonly esAutorizador = computed(() => {
    if ((this.auth.permisos?.().size ?? 0) > 0) {
      return this.auth.tienePermiso('comunicados.autorizar');
    }
    return esRolAutorizador(this.auth.rol());
  });

  // Estado del comunicado en edición
  readonly comunicadoId = signal<number | null>(null);
  readonly folioActual = signal<string | null>(null);
  readonly rejectedFeedback = signal<string | null>(null);
  readonly loadingDraft = signal(false);
  readonly subject = signal('');
  readonly bodyHtml = signal('');
  readonly wordCount = signal(0);
  readonly charCount = signal(0);
  readonly lastSavedLabel = signal('Sin guardar');

  // Segmentación
  readonly resumen = signal<SegmentacionResumen | null>(null);
  readonly modoDestinatarios = signal<ModoDestinatarios>('todos');
  readonly selectedAreaIds = signal<ReadonlySet<number>>(new Set());
  readonly selectedCategorias = signal<ReadonlySet<CategoriaCctTipo>>(new Set());
  readonly extraEmpleados = signal<readonly EmpleadoSegmento[]>([]);
  readonly empleadoQuery = signal('');
  readonly empleadosEncontrados = signal<readonly EmpleadoSegmento[]>([]);
  readonly buscandoEmpleados = signal(false);
  readonly totalDestinatarios = signal(0);
  readonly muestraDestinatarios = signal<readonly DestinatarioMuestra[]>([]);
  readonly destinatariosPreview = signal<readonly DestinatarioMuestra[]>([]);
  readonly mostrarListaDestinatarios = signal(false);
  readonly filtroListaDestinatarios = signal('');

  // Adjuntos
  readonly attachments = signal<readonly ComunicadoArchivo[]>([]);
  readonly imagePreviewUrls = signal<ReadonlyMap<number, string>>(new Map());
  readonly isDragging = signal(false);
  readonly uploadingFiles = signal(false);

  // Estados de envío
  readonly saving = signal(false);
  readonly submitting = signal(false);
  readonly sendingTest = signal(false);

  // Drawers y modales
  readonly previewDrawerOpen = signal(false);
  readonly confirmSendModalOpen = signal(false);
  readonly authSubmittedModalOpen = signal(false);
  readonly submittedFolio = signal<string | null>(null);
  readonly sampleIndex = signal(0);

  private readonly objectUrls: string[] = [];
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly totalAttachmentsBytes = computed(() =>
    this.attachments().reduce((sum, item) => sum + item.tamano_bytes, 0),
  );

  readonly storagePercent = computed(() =>
    Math.min(100, (this.totalAttachmentsBytes() / MAX_ADJUNTOS_BYTES) * 100),
  );

  readonly storageLabel = computed(() => {
    const usedMb = (this.totalAttachmentsBytes() / (1024 * 1024)).toFixed(2);
    return `${usedMb} MB / 2.00 MB`;
  });

  readonly destinatariosVisibles = computed(() => {
    const filtro = this.filtroListaDestinatarios().trim().toLowerCase();
    const lista = this.destinatariosPreview();
    if (!filtro) {
      return lista;
    }
    return lista.filter(
      (d) =>
        d.correo_destino.toLowerCase().includes(filtro) ||
        d.nombre_destino.toLowerCase().includes(filtro) ||
        d.area_nombre.toLowerCase().includes(filtro),
    );
  });

  readonly sugerenciasEmpleados = computed(() => {
    const idsAgregados = new Set(this.extraEmpleados().map((e) => e.id));
    return this.empleadosEncontrados().filter((e) => !idsAgregados.has(e.id));
  });

  readonly imagesAttachments = computed(() => this.attachments().filter((a) => a.es_imagen));
  readonly docsAttachments = computed(() => this.attachments().filter((a) => !a.es_imagen));

  readonly selectedAreasSum = computed(() => {
    const selected = this.selectedAreaIds();
    return (this.resumen()?.areas ?? [])
      .filter((a) => selected.has(a.id))
      .reduce((acc, a) => acc + a.count, 0);
  });

  readonly selectedCategoriasSum = computed(() => {
    const selected = this.selectedCategorias();
    return (this.resumen()?.categorias_cct ?? [])
      .filter((c) => selected.has(c.tipo))
      .reduce((acc, c) => acc + c.count, 0);
  });

  readonly scopeSummary = computed(() => {
    const modo = this.modoDestinatarios();
    if (modo === 'todos') {
      return 'Padrón completo activo con correo institucional';
    }
    const extraCount = this.extraEmpleados().length;
    if (modo === 'area') {
      const count = this.selectedAreaIds().size;
      if (count === 0 && extraCount === 0) {
        return 'Selecciona al menos un área o empleado adicional';
      }
      const parts: string[] = [];
      if (count > 0) {
        parts.push(`${count} ${count === 1 ? 'área' : 'áreas'}`);
      }
      if (extraCount > 0) {
        parts.push(`${extraCount} adicional(es)`);
      }
      return `Por Área: ${parts.join(' + ')}`;
    }
    const catCount = this.selectedCategorias().size;
    if (catCount === 0 && extraCount === 0) {
      return 'Selecciona al menos una categoría o empleado adicional';
    }
    const names = (this.resumen()?.categorias_cct ?? [])
      .filter((c) => this.selectedCategorias().has(c.tipo))
      .map((c) => c.nombre);
    if (extraCount > 0) {
      names.push(`+${extraCount} adicional(es)`);
    }
    return names.join(', ');
  });

  readonly sampleOptions = computed<readonly DestinatarioMuestra[]>(() => {
    const muestra = this.muestraDestinatarios();
    if (muestra.length > 0) {
      return muestra;
    }
    return [
      {
        empleado_id: 0,
        correo_destino: 'personal@utn.edu.mx',
        nombre_destino: 'María Elena López Hernández',
        area_nombre: 'Recursos Humanos',
        categoria_nombre: 'Administrativos',
        numero_empleado: 'EMP-1001',
      },
    ];
  });

  readonly currentSample = computed(() => {
    const options = this.sampleOptions();
    const idx = Math.min(this.sampleIndex(), Math.max(0, options.length - 1));
    return options[idx] ?? options[0];
  });

  readonly previewSubject = computed(() =>
    reemplazarVariablesTexto(
      this.subject().trim() || '(Sin asunto definido)',
      this.currentSample(),
    ),
  );

  readonly previewBodySafe = computed<SafeHtml>(() => {
    const raw =
      this.bodyHtml().trim() || '<p>El cuerpo del comunicado está vacío.</p>';
    const resolved = reemplazarVariablesHtmlPreview(
      raw,
      this.currentSample(),
      this.imagePreviewUrls(),
    );
    return this.sanitizer.bypassSecurityTrustHtml(resolved);
  });

  constructor() {
    this.cargarResumenSegmentacion();

    const initialNuevoTick = this.mensajeria.nuevoCorreoSolicitud();
    effect(() => {
      if (this.mensajeria.nuevoCorreoSolicitud() > initialNuevoTick) {
        untracked(() => this.resetComposer());
      }
    });

    const sub = this.route.queryParamMap.subscribe((params) => {
      const borradorParam = params.get('borrador');
      if (borradorParam && /^\d+$/.test(borradorParam)) {
        const id = Number(borradorParam);
        if (this.comunicadoId() !== id) {
          this.cargarComunicadoParaEdicion(id);
        }
      } else if (
        this.comunicadoId() !== null ||
        this.folioActual() !== null ||
        this.rejectedFeedback() !== null
      ) {
        this.resetComposer();
      }
    });

    this.destroyRef.onDestroy(() => {
      sub.unsubscribe();
      if (this.previewTimer !== null) {
        clearTimeout(this.previewTimer);
      }
      if (this.searchTimer !== null) {
        clearTimeout(this.searchTimer);
      }
      for (const url of this.objectUrls) {
        URL.revokeObjectURL(url);
      }
    });
  }

  cargarComunicadoParaEdicion(id: number): void {
    this.loadingDraft.set(true);
    this.mensajeria
      .obtenerComunicado(id)
      .pipe(finalize(() => this.loadingDraft.set(false)))
      .subscribe({
        next: (res) => this.aplicarComunicadoEnEditor(res.comunicado),
        error: (err) => this.mostrarErrorHttp(err, 'No se pudo abrir el borrador solicitado.'),
      });
  }

  aplicarComunicadoEnEditor(item: ComunicadoDto): void {
    if (!item.es_editable) {
      this.toast.show({
        type: 'error',
        title: 'Este comunicado ya fue enviado o está en revisión y no puede editarse.',
      });
      return;
    }

    const htmlNormalizado = normalizarFichasEditorHtml(item.contenido_html);
    this.comunicadoId.set(item.id);
    this.folioActual.set(item.folio);
    this.rejectedFeedback.set(item.status === 'RECHAZADO' ? item.feedback_rechazo : null);
    this.subject.set(item.asunto);
    this.bodyHtml.set(htmlNormalizado);
    this.actualizarConteoDesdeHtml(htmlNormalizado);
    this.modoDestinatarios.set(item.modo_destinatarios);
    this.selectedAreaIds.set(new Set(item.filtros_json?.area_ids ?? []));
    this.selectedCategorias.set(new Set(item.filtros_json?.categorias_tipo ?? []));
    this.extraEmpleados.set(item.empleados_extra ?? []);
    this.attachments.set(item.archivos ?? []);
    this.lastSavedLabel.set(item.folio ? `Folio ${item.folio}` : 'Borrador cargado');
    this.cargarImagenesDeComunicado(item);
    this.programarPrevisualizacion();
    this.richEditorRef()?.setHtml(htmlNormalizado);
  }

  cargarResumenSegmentacion(): void {
    this.mensajeria.resumenSegmentacion().subscribe({
      next: (res) => {
        this.resumen.set(res);
        if (this.modoDestinatarios() === 'todos') {
          this.totalDestinatarios.set(res.total_activos);
        }
        this.programarPrevisualizacion();
      },
      error: (err) => this.mostrarErrorHttp(err, 'No se pudo cargar la segmentación del padrón.'),
    });
  }

  setModoDestinatarios(modo: ModoDestinatarios): void {
    this.modoDestinatarios.set(modo);
    this.programarPrevisualizacion();
  }

  toggleArea(areaId: number): void {
    this.selectedAreaIds.update((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) {
        next.delete(areaId);
      } else {
        next.add(areaId);
      }
      return next;
    });
    this.programarPrevisualizacion();
  }

  toggleAllAreas(): void {
    const todas = this.resumen()?.areas ?? [];
    if (this.selectedAreaIds().size === todas.length) {
      this.selectedAreaIds.set(new Set());
    } else {
      this.selectedAreaIds.set(new Set(todas.map((a) => a.id)));
    }
    this.programarPrevisualizacion();
  }

  toggleCategoria(tipo: CategoriaCctTipo): void {
    this.selectedCategorias.update((prev) => {
      const next = new Set(prev);
      if (next.has(tipo)) {
        next.delete(tipo);
      } else {
        next.add(tipo);
      }
      return next;
    });
    this.programarPrevisualizacion();
  }

  toggleAllCategorias(): void {
    const todas = this.resumen()?.categorias_cct ?? [];
    if (this.selectedCategorias().size === todas.length) {
      this.selectedCategorias.set(new Set());
    } else {
      this.selectedCategorias.set(new Set(todas.map((c) => c.tipo)));
    }
    this.programarPrevisualizacion();
  }

  onEmpleadoQueryInput(valor: string): void {
    this.empleadoQuery.set(valor);
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
    }
    const limpio = valor.trim();
    if (limpio.length === 0) {
      this.empleadosEncontrados.set([]);
      this.buscandoEmpleados.set(false);
      return;
    }
    this.buscandoEmpleados.set(true);
    this.searchTimer = setTimeout(() => {
      this.mensajeria
        .buscarEmpleados(limpio)
        .pipe(finalize(() => this.buscandoEmpleados.set(false)))
        .subscribe({
          next: (res) => this.empleadosEncontrados.set(res.empleados),
          error: () => this.empleadosEncontrados.set([]),
        });
    }, 200);
  }

  toggleListaDestinatarios(): void {
    this.mostrarListaDestinatarios.update((open) => !open);
  }

  agregarEmpleadoExtra(emp: EmpleadoSegmento): void {
    if (this.extraEmpleados().some((e) => e.id === emp.id)) {
      this.toast.show({ type: 'info', title: 'Este empleado ya está en la lista.' });
      return;
    }
    this.extraEmpleados.update((list) => [...list, emp]);
    this.empleadoQuery.set('');
    this.empleadosEncontrados.set([]);
    this.programarPrevisualizacion(0);
  }

  quitarEmpleadoExtra(id: number): void {
    this.extraEmpleados.update((list) => list.filter((e) => e.id !== id));
    this.programarPrevisualizacion(0);
  }

  toggleSubjectPrefix(prefix: string): void {
    let current = this.subject().trim();
    if (current.startsWith(prefix)) {
      current = current.slice(prefix.length).trim();
    } else {
      current = current.replace(/^\[(AVISO OFICIAL|NOM-035|CAPACITACIÓN)\]\s*/i, '');
      current = `${prefix} ${current}`.trim();
    }
    this.subject.set(current.slice(0, 120));
  }

  onEditorHtmlChange(html: string): void {
    this.bodyHtml.set(html);
  }

  onEditorStatsChange(stats: { words: number; chars: number }): void {
    this.wordCount.set(stats.words);
    this.charCount.set(stats.chars);
  }

  onEditorFilesReceived(files: File[]): void {
    void this.subirArchivos(files, true);
  }

  insertDynamicVariable(variable: VariableDinamica): void {
    this.richEditorRef()?.insertVariable(variable);
  }

  openFilePicker(): void {
    this.fileInputRef()?.nativeElement.click();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      void this.subirArchivos(Array.from(files));
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      void this.subirArchivos(Array.from(input.files));
      input.value = '';
    }
  }

  async subirArchivos(files: File[], insertarImagenesEnCuerpo = false): Promise<void> {
    if (this.uploadingFiles()) {
      return;
    }
    this.uploadingFiles.set(true);

    try {
      const id = await this.asegurarBorradorPersistido();
      if (id === null) {
        return;
      }

      for (const file of files) {
        if (this.totalAttachmentsBytes() + file.size > MAX_ADJUNTOS_BYTES) {
          this.toast.show({
            type: 'error',
            title: 'Límite de 2 MB superado',
            message: `"${file.name}" excede la capacidad disponible.`,
          });
          continue;
        }

        const res = await firstValueFrom(this.mensajeria.subirAdjunto(id, file));
        const archivoGuardado = res.archivo;

        if (archivoGuardado.es_imagen) {
          const localUrl = URL.createObjectURL(file);
          this.objectUrls.push(localUrl);
          this.imagePreviewUrls.update((prev) => {
            const next = new Map(prev);
            next.set(archivoGuardado.id, localUrl);
            return next;
          });

          if (insertarImagenesEnCuerpo) {
            const naturalWidth = await this.obtenerAnchoNaturalImagen(localUrl);
            this.richEditorRef()?.insertAttachedImage(archivoGuardado, localUrl, naturalWidth);
            this.attachments.update((list) => [
              ...list,
              { ...archivoGuardado, embebido_en_cuerpo: true },
            ]);
          } else {
            this.attachments.update((list) => [...list, archivoGuardado]);
          }
        } else {
          this.attachments.update((list) => [...list, archivoGuardado]);
        }

        this.toast.show({
          type: 'success',
          title: insertarImagenesEnCuerpo ? 'Imagen pegada y adjuntada' : 'Archivo adjuntado',
          message: archivoGuardado.nombre_original,
        });
      }
    } catch (err) {
      this.mostrarErrorHttp(err, 'No se pudo subir el archivo adjunto.');
    } finally {
      this.uploadingFiles.set(false);
    }
  }

  async insertarImagenEnCuerpo(archivo: ComunicadoArchivo): Promise<void> {
    if (!archivo.es_imagen) {
      return;
    }
    const url = this.imagePreviewUrls().get(archivo.id) ?? archivo.url_descarga;
    const naturalWidth = await this.obtenerAnchoNaturalImagen(url);
    this.richEditorRef()?.insertAttachedImage(archivo, url, naturalWidth);
    this.attachments.update((list) =>
      list.map((a) => (a.id === archivo.id ? { ...a, embebido_en_cuerpo: true } : a)),
    );
    this.toast.show({ type: 'success', title: 'Imagen insertada en el cuerpo del correo.' });
  }

  eliminarAdjunto(archivo: ComunicadoArchivo): void {
    const id = this.comunicadoId();
    if (id === null) {
      return;
    }
    this.mensajeria.eliminarAdjunto(id, archivo.id).subscribe({
      next: () => {
        this.richEditorRef()?.removeImagesByAttachmentId(archivo.id);
        this.attachments.update((list) => list.filter((a) => a.id !== archivo.id));
      },
      error: (err) => this.mostrarErrorHttp(err, 'No se pudo eliminar el adjunto.'),
    });
  }

  async guardarBorrador(silencioso = false): Promise<number | null> {
    if (!this.validarCamposBasicos()) {
      return null;
    }
    this.saving.set(true);
    try {
      const saved = await this.persistirComunicado();
      this.mensajeria.refrescarConteos();
      const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      this.lastSavedLabel.set(`Guardado · ${hora}`);
      if (!silencioso) {
        this.toast.show({ type: 'success', title: `Borrador guardado (${hora}).` });
      }
      return saved.id;
    } catch (err) {
      this.mostrarErrorHttp(err, 'No se pudo guardar el borrador.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async enviarPrueba(): Promise<void> {
    if (!this.validarCamposParaEnvio()) {
      return;
    }
    this.sendingTest.set(true);
    try {
      const saved = await this.persistirComunicado();
      const sample = this.currentSample();
      const res = await firstValueFrom(
        this.mensajeria.enviarPrueba(
          saved.id,
          sample.empleado_id > 0 ? sample.empleado_id : undefined,
        ),
      );
      this.toast.show({ type: 'success', title: res.mensaje });
    } catch (err) {
      this.mostrarErrorHttp(err, 'No se pudo enviar el correo de prueba.');
    } finally {
      this.sendingTest.set(false);
    }
  }

  abrirVistaPrevia(): void {
    this.sampleIndex.set(0);
    this.previewDrawerOpen.set(true);
  }

  handlePrimaryAction(): void {
    if (!this.validarCamposParaEnvio()) {
      return;
    }
    if (this.esAutorizador()) {
      this.confirmSendModalOpen.set(true);
      return;
    }
    void this.solicitarAutorizacion();
  }

  async solicitarAutorizacion(): Promise<void> {
    this.submitting.set(true);
    try {
      const saved = await this.persistirComunicado();
      const res = await firstValueFrom(this.mensajeria.solicitarAutorizacion(saved.id));
      this.mensajeria.refrescarConteos();
      this.submittedFolio.set(res.comunicado.folio);
      this.resetComposer();
      this.authSubmittedModalOpen.set(true);
      this.toast.show({
        type: 'success',
        title: `Solicitud ${res.comunicado.folio ?? ''} enviada a autorización.`,
      });
    } catch (err) {
      this.mostrarErrorHttp(err, 'No se pudo solicitar autorización.');
    } finally {
      this.submitting.set(false);
    }
  }

  async confirmarEnvioDirecto(): Promise<void> {
    this.submitting.set(true);
    try {
      const saved = await this.persistirComunicado();
      const res = await firstValueFrom(this.mensajeria.enviarDirecto(saved.id));
      this.mensajeria.refrescarConteos();
      this.confirmSendModalOpen.set(false);
      this.toast.show({
        type: 'success',
        title: `Comunicado ${res.comunicado.folio ?? ''} encolado para envío masivo.`,
      });
      this.resetComposer();
      void this.router.navigate(['/mensajeria/historial']);
    } catch (err) {
      this.mostrarErrorHttp(err, 'No se pudo enviar el comunicado.');
    } finally {
      this.submitting.set(false);
    }
  }

  irAAutorizaciones(): void {
    this.authSubmittedModalOpen.set(false);
    void this.router.navigate(['/mensajeria/autorizaciones']);
  }

  irABorradores(): void {
    void this.router.navigate(['/mensajeria/borradores']);
  }

  irAHistorial(): void {
    void this.router.navigate(['/mensajeria/historial']);
  }

  nuevoBorradorLimpio(): void {
    this.resetComposer();
    void this.router.navigate(['/mensajeria']);
  }

  formatBytes(bytes: number): string {
    return formatFileSize(bytes);
  }

  private async obtenerAnchoNaturalImagen(url: string): Promise<number> {
    if (typeof Image === 'undefined' || !url) {
      return 480;
    }
    return new Promise((resolve) => {
      let settled = false;
      const done = (width: number) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(width);
        }
      };

      const timer = setTimeout(() => done(480), 150);
      const img = new Image();
      img.onload = () => done(img.naturalWidth > 0 ? img.naturalWidth : 480);
      img.onerror = () => done(480);
      img.src = url;
      if (img.complete && img.naturalWidth > 0) {
        done(img.naturalWidth);
      }
    });
  }

  private async asegurarBorradorPersistido(): Promise<number | null> {
    const actual = this.comunicadoId();
    if (actual !== null) {
      return actual;
    }
    const payload = this.construirPayload(true);
    const res = await firstValueFrom(this.mensajeria.crearBorrador(payload));
    this.comunicadoId.set(res.comunicado.id);
    this.lastSavedLabel.set('Borrador iniciado');
    this.mensajeria.refrescarConteos();
    return res.comunicado.id;
  }

  private async persistirComunicado(): Promise<ComunicadoDto> {
    const editor = this.richEditorRef();
    if (editor) {
      const actualHtml = editor.getHtml();
      if (actualHtml) {
        this.bodyHtml.set(actualHtml);
      }
    }

    const payload = this.construirPayload(false);
    const id = this.comunicadoId();
    const res =
      id !== null
        ? await firstValueFrom(this.mensajeria.actualizarComunicado(id, payload))
        : await firstValueFrom(this.mensajeria.crearBorrador(payload));

    this.comunicadoId.set(res.comunicado.id);
    this.folioActual.set(res.comunicado.folio);
    this.attachments.set(res.comunicado.archivos ?? this.attachments());
    return res.comunicado;
  }

  private construirPayload(permitirBorradorVacio: boolean): GuardarComunicadoPayload {
    const filtros: FiltrosComunicado = {
      area_ids: Array.from(this.selectedAreaIds()),
      categorias_tipo: Array.from(this.selectedCategorias()),
      empleado_ids_extra: this.extraEmpleados().map((e) => e.id),
    };

    const asunto = this.subject().trim();
    const cuerpo = this.bodyHtml().trim();

    return {
      asunto: permitirBorradorVacio && asunto === '' ? 'Borrador sin asunto' : asunto,
      contenido_html: permitirBorradorVacio && cuerpo === '' ? '<p></p>' : cuerpo,
      modo_destinatarios: this.modoDestinatarios(),
      filtros,
    };
  }

  private validarCamposBasicos(): boolean {
    if (this.subject().trim() === '') {
      this.toast.show({ type: 'error', title: 'Escribe un asunto para guardar el comunicado.' });
      return false;
    }
    if (!this.tieneContenidoCuerpo()) {
      this.toast.show({ type: 'error', title: 'El cuerpo del mensaje no puede estar vacío.' });
      return false;
    }
    return true;
  }

  private validarCamposParaEnvio(): boolean {
    if (!this.validarCamposBasicos()) {
      return false;
    }
    if (this.totalDestinatarios() <= 0) {
      this.toast.show({
        type: 'error',
        title: 'Selecciona al menos un destinatario activo.',
      });
      return false;
    }
    return true;
  }

  private tieneContenidoCuerpo(): boolean {
    const htmlActual = this.richEditorRef()?.getHtml() || this.bodyHtml();
    const clean = this.sanitizer.sanitize(SecurityContext.HTML, htmlActual) ?? '';
    return clean.replace(/<[^>]*>/g, '').trim().length > 0 || clean.includes('<img');
  }

  private actualizarConteoDesdeHtml(rawHtml: string): void {
    const clean = (this.sanitizer.sanitize(SecurityContext.HTML, rawHtml) ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .trim();
    this.wordCount.set(clean ? clean.split(/\s+/).length : 0);
    this.charCount.set(clean.length);
  }

  private programarPrevisualizacion(delayMs = 150): void {
    if (this.previewTimer !== null) {
      clearTimeout(this.previewTimer);
    }
    this.previewTimer = setTimeout(() => {
      const filtros: FiltrosComunicado = {
        area_ids: Array.from(this.selectedAreaIds()),
        categorias_tipo: Array.from(this.selectedCategorias()),
        empleado_ids_extra: this.extraEmpleados().map((e) => e.id),
      };
      this.mensajeria.previsualizarDestinatarios(this.modoDestinatarios(), filtros).subscribe({
        next: (res) => {
          this.totalDestinatarios.set(res.total);
          this.muestraDestinatarios.set(res.muestra);
          this.destinatariosPreview.set(res.destinatarios ?? res.muestra);
          if (res.total === 0) {
            this.mostrarListaDestinatarios.set(false);
          }
        },
      });
    }, delayMs);
  }

  private cargarImagenesDeComunicado(comunicado: ComunicadoDto): void {
    for (const archivo of comunicado.archivos ?? []) {
      if (archivo.es_imagen && !this.imagePreviewUrls().has(archivo.id)) {
        this.cargarImagenPreview(comunicado.id, archivo.id);
      }
    }
  }

  private cargarImagenPreview(comunicadoId: number, archivoId: number): void {
    this.mensajeria.descargarAdjunto(comunicadoId, archivoId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        this.objectUrls.push(url);
        this.imagePreviewUrls.update((prev) => {
          const next = new Map(prev);
          next.set(archivoId, url);
          return next;
        });
      },
    });
  }

  private resetComposer(): void {
    this.comunicadoId.set(null);
    this.folioActual.set(null);
    this.rejectedFeedback.set(null);
    this.subject.set('');
    this.bodyHtml.set('');
    this.wordCount.set(0);
    this.charCount.set(0);
    this.lastSavedLabel.set('Sin guardar');
    this.modoDestinatarios.set('todos');
    this.selectedAreaIds.set(new Set());
    this.selectedCategorias.set(new Set());
    this.extraEmpleados.set([]);
    this.empleadoQuery.set('');
    this.empleadosEncontrados.set([]);
    this.mostrarListaDestinatarios.set(false);
    this.filtroListaDestinatarios.set('');
    this.attachments.set([]);
    this.imagePreviewUrls.set(new Map());
    this.richEditorRef()?.setHtml('');
    this.programarPrevisualizacion();
  }

  private mostrarErrorHttp(err: unknown, fallback: string): void {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { message?: string; mensaje?: string; errors?: Record<string, string[]> } | null;
      const firstValidation = body?.errors ? Object.values(body.errors)[0]?.[0] : undefined;
      const msg = firstValidation || body?.mensaje || body?.message || fallback;
      this.toast.show({ type: 'error', title: msg });
      return;
    }
    this.toast.show({ type: 'error', title: fallback });
  }
}
