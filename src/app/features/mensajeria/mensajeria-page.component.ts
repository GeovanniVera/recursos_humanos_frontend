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
  escapeHtml,
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

@Component({
  selector: 'app-mensajeria-page',
  imports: [FormsModule, PageHeader, AlertBanner, Button, Drawer, Modal, MailPreview],
  templateUrl: './mensajeria-page.component.html',
  styleUrl: './mensajeria-page.component.scss',
  host: {
    '(document:selectionchange)': 'onDocumentSelectionChange()',
  },
})
export class MensajeriaPage {
  private readonly mensajeria = inject(MensajeriaService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly richEditorRef = viewChild<ElementRef<HTMLDivElement>>('richEditor');
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

  // Indicadores activos de formato de texto
  readonly boldActive = signal(false);
  readonly italicActive = signal(false);
  readonly underlineActive = signal(false);
  readonly ulActive = signal(false);
  readonly olActive = signal(false);
  readonly alignLeftActive = signal(false);
  readonly alignCenterActive = signal(false);
  readonly alignRightActive = signal(false);
  readonly alignJustifyActive = signal(false);

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

  // Popover y verificación de enlaces
  readonly linkPopoverOpen = signal(false);
  readonly linkText = signal('');
  readonly linkUrl = signal('');
  readonly activeLinkHref = signal<string | null>(null);

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

  private savedSelectionRange: Range | null = null;
  private activeLinkEl: HTMLAnchorElement | null = null;
  private activeImageEl: HTMLImageElement | null = null;
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
        this.resetComposer();
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

    this.comunicadoId.set(item.id);
    this.folioActual.set(item.folio);
    this.rejectedFeedback.set(item.status === 'RECHAZADO' ? item.feedback_rechazo : null);
    this.subject.set(item.asunto);
    this.bodyHtml.set(normalizarFichasEditorHtml(item.contenido_html));
    this.modoDestinatarios.set(item.modo_destinatarios);
    this.selectedAreaIds.set(new Set(item.filtros_json?.area_ids ?? []));
    this.selectedCategorias.set(new Set(item.filtros_json?.categorias_tipo ?? []));
    this.attachments.set(item.archivos ?? []);
    this.lastSavedLabel.set(item.folio ? `Folio ${item.folio}` : 'Borrador cargado');
    this.cargarImagenesDeComunicado(item);
    this.programarPrevisualizacion();
    this.syncEditorFromSignal();
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
    this.programarPrevisualizacion();
  }

  quitarEmpleadoExtra(id: number): void {
    this.extraEmpleados.update((list) => list.filter((e) => e.id !== id));
    this.programarPrevisualizacion();
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

  saveEditorSelection(): void {
    const editor = this.richEditorRef()?.nativeElement;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) {
      return;
    }
    const range = sel.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      this.savedSelectionRange = range.cloneRange();
      this.actualizarEstadoFormato();
      this.actualizarEnlaceActivo(range.commonAncestorContainer);
    }
  }

  onDocumentSelectionChange(): void {
    const editor = this.richEditorRef()?.nativeElement;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) {
      return;
    }
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    if (editor.contains(node)) {
      if (this.activeImageEl && !range.intersectsNode(this.activeImageEl)) {
        this.activeImageEl = null;
      }
      this.actualizarEstadoFormato();
      this.actualizarEnlaceActivo(node);
    }
  }

  onEditorClick(event: MouseEvent): void {
    const editor = this.richEditorRef()?.nativeElement;
    const target = event.target as HTMLElement | null;
    if (target instanceof HTMLImageElement && editor?.contains(target)) {
      this.activeImageEl = target;
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNode(target);
        sel.removeAllRanges();
        sel.addRange(range);
        this.savedSelectionRange = range.cloneRange();
      }
      this.activeLinkEl = null;
      this.activeLinkHref.set(null);
      this.actualizarEstadoFormato();
      return;
    }

    this.activeImageEl = null;
    const anchor = target?.closest('a') ?? null;

    if (anchor && editor?.contains(anchor)) {
      this.activeLinkEl = anchor;
      this.activeLinkHref.set(anchor.getAttribute('href'));
      if (event.ctrlKey || event.metaKey) {
        const href = anchor.getAttribute('href');
        if (href) {
          event.preventDefault();
          window.open(href, '_blank', 'noopener,noreferrer');
          return;
        }
      }
    }

    this.saveEditorSelection();
  }

  onEditorKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      this.autoLinkificarAntesDelCursor();
    }
  }

  onEditorInput(): void {
    const editor = this.richEditorRef()?.nativeElement;
    if (!editor) {
      return;
    }
    this.bodyHtml.set(editor.innerHTML);
    const plain = (editor.innerText ?? '').trim();
    this.wordCount.set(plain ? plain.split(/\s+/).length : 0);
    this.charCount.set(plain.length);
    this.actualizarEstadoFormato();
  }

  execFormat(command: string): void {
    this.restoreEditorSelection();
    if (command === 'removeFormat') {
      this.limpiarFormatoSeleccionado();
    } else {
      document.execCommand(command, false);
    }
    this.onEditorInput();
    this.saveEditorSelection();
    this.actualizarEstadoFormato();
  }

  execAlign(align: 'left' | 'center' | 'right' | 'justify'): void {
    this.restoreEditorSelection();
    const editor = this.richEditorRef()?.nativeElement;

    if (this.activeImageEl && editor?.contains(this.activeImageEl)) {
      if (align !== 'justify') {
        this.activeImageEl.setAttribute('data-align', align);
      }
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNode(this.activeImageEl);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } else {
      const cmdMap: Record<'left' | 'center' | 'right' | 'justify', string> = {
        left: 'justifyLeft',
        center: 'justifyCenter',
        right: 'justifyRight',
        justify: 'justifyFull',
      };
      document.execCommand(cmdMap[align], false);

      if (editor && align !== 'justify') {
        this.sincronizarAlineacionImagenesEnSeleccion(editor, align);
      }
    }

    this.onEditorInput();
    this.saveEditorSelection();
    this.actualizarEstadoFormato();
  }

  abrirEnlaceActivo(): void {
    const href = this.activeLinkHref();
    if (!href) {
      return;
    }
    const normalized = /^https?:\/\//i.test(href) ? href : `https://${href}`;
    window.open(normalized, '_blank', 'noopener,noreferrer');
  }

  quitarEnlaceActivo(): void {
    const editor = this.richEditorRef()?.nativeElement;
    const anchor = this.activeLinkEl;
    if (!editor || !anchor || !editor.contains(anchor)) {
      return;
    }
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(anchor);
      sel.removeAllRanges();
      sel.addRange(range);
      this.savedSelectionRange = range.cloneRange();
    }
    document.execCommand('unlink', false);
    this.activeLinkEl = null;
    this.activeLinkHref.set(null);
    this.onEditorInput();
  }

  insertDynamicVariable(variable: VariableDinamica): void {
    this.restoreEditorSelection();
    const html = `<span contenteditable="false" data-var="${escapeHtml(variable.token)}" class="var-token">${escapeHtml(variable.etiqueta)}</span>&nbsp;`;
    document.execCommand('insertHTML', false, html);
    this.saveEditorSelection();
    this.onEditorInput();
  }

  toggleLinkPopover(force?: boolean): void {
    const next = force ?? !this.linkPopoverOpen();
    if (next) {
      this.saveEditorSelection();
    }
    this.linkPopoverOpen.set(next);
  }

  confirmInsertLink(): void {
    let url = this.linkUrl().trim();
    if (!url) {
      this.toast.show({ type: 'error', title: 'Ingresa una dirección web válida.' });
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }
    const label = escapeHtml(this.linkText().trim() || url);
    this.restoreEditorSelection();
    document.execCommand(
      'insertHTML',
      false,
      `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>&nbsp;`,
    );
    this.linkText.set('');
    this.linkUrl.set('');
    this.linkPopoverOpen.set(false);
    this.onEditorInput();
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

  async subirArchivos(files: File[]): Promise<void> {
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
        this.attachments.update((list) => [...list, res.archivo]);
        if (res.archivo.es_imagen) {
          this.cargarImagenPreview(id, res.archivo.id);
        }
        this.toast.show({
          type: 'success',
          title: 'Archivo adjuntado',
          message: res.archivo.nombre_original,
        });
      }
    } catch (err) {
      this.mostrarErrorHttp(err, 'No se pudo subir el archivo adjunto.');
    } finally {
      this.uploadingFiles.set(false);
    }
  }

  insertarImagenEnCuerpo(archivo: ComunicadoArchivo): void {
    if (!archivo.es_imagen) {
      return;
    }
    const url = this.imagePreviewUrls().get(archivo.id) ?? archivo.url_descarga;
    this.restoreEditorSelection();
    const imgHtml = `<img src="${escapeHtml(url)}" alt="${escapeHtml(archivo.nombre_original)}" data-att-id="${archivo.id}" class="embedded-mail-img" /><p><br></p>`;
    document.execCommand('insertHTML', false, imgHtml);
    this.onEditorInput();
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
        const editor = this.richEditorRef()?.nativeElement;
        if (editor) {
          editor
            .querySelectorAll(`img[data-att-id="${archivo.id}"]`)
            .forEach((img) => img.remove());
          this.onEditorInput();
        }
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
      void this.router.navigate(['/mensajeria/autorizaciones']);
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

  nuevoBorradorLimpio(): void {
    this.resetComposer();
    void this.router.navigate(['/mensajeria']);
  }

  formatBytes(bytes: number): string {
    return formatFileSize(bytes);
  }

  private actualizarEstadoFormato(): void {
    const editor = this.richEditorRef()?.nativeElement;
    if (this.activeImageEl && editor?.contains(this.activeImageEl)) {
      const align = this.activeImageEl.getAttribute('data-align') || 'left';
      this.alignLeftActive.set(align === 'left');
      this.alignCenterActive.set(align === 'center');
      this.alignRightActive.set(align === 'right');
      this.alignJustifyActive.set(false);
    }

    if (typeof document.queryCommandState !== 'function') {
      return;
    }
    try {
      this.boldActive.set(document.queryCommandState('bold'));
      this.italicActive.set(document.queryCommandState('italic'));
      this.underlineActive.set(document.queryCommandState('underline'));
      this.ulActive.set(document.queryCommandState('insertUnorderedList'));
      this.olActive.set(document.queryCommandState('insertOrderedList'));

      if (!this.activeImageEl || !editor?.contains(this.activeImageEl)) {
        const left = document.queryCommandState('justifyLeft');
        const center = document.queryCommandState('justifyCenter');
        const right = document.queryCommandState('justifyRight');
        const justify = document.queryCommandState('justifyFull');

        if (left || center || right || justify) {
          this.alignLeftActive.set(left);
          this.alignCenterActive.set(center);
          this.alignRightActive.set(right);
          this.alignJustifyActive.set(justify);
        } else {
          const blockAlign = this.leerAlineacionBloqueActual(editor);
          this.alignLeftActive.set(blockAlign === 'left');
          this.alignCenterActive.set(blockAlign === 'center');
          this.alignRightActive.set(blockAlign === 'right');
          this.alignJustifyActive.set(blockAlign === 'justify');
        }
      }
    } catch {
      // Algunos entornos de pruebas o navegadores restringen queryCommandState fuera de foco.
    }
  }

  private leerAlineacionBloqueActual(editor: HTMLElement | undefined): string {
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) {
      return 'left';
    }
    let node: Node | null = sel.getRangeAt(0).startContainer;
    while (node && node !== editor) {
      if (node instanceof HTMLElement) {
        const inlineAlign = node.style.textAlign;
        if (inlineAlign) {
          return inlineAlign.toLowerCase();
        }
      }
      node = node.parentNode;
    }
    return 'left';
  }

  private sincronizarAlineacionImagenesEnSeleccion(
    editor: HTMLElement,
    align: 'left' | 'center' | 'right',
  ): void {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      return;
    }
    const range = sel.getRangeAt(0);
    for (const img of Array.from(editor.querySelectorAll('img'))) {
      try {
        if (range.intersectsNode(img) || img.parentElement?.contains(range.startContainer)) {
          img.setAttribute('data-align', align);
        }
      } catch {
        // Ignora nodos fuera de rango
      }
    }
  }

  private async asegurarBorradorPersistido(): Promise<number | null> {
    const actual = this.comunicadoId();
    if (actual !== null) {
      return actual;
    }
    const payload = this.construirPayload(true);
    const res = await firstValueFrom(this.mensajeria.crearBorrador(payload));
    this.comunicadoId.set(res.comunicado.id);
    return res.comunicado.id;
  }

  private async persistirComunicado(): Promise<ComunicadoDto> {
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
    const editor = this.richEditorRef()?.nativeElement;
    if (editor) {
      const texto = (editor.innerText ?? '').trim();
      if (texto.length > 0 || editor.querySelector('img') !== null) {
        return true;
      }
    }
    const clean = this.sanitizer.sanitize(SecurityContext.HTML, this.bodyHtml()) ?? '';
    return clean.replace(/<[^>]*>/g, '').trim().length > 0 || clean.includes('<img');
  }

  private programarPrevisualizacion(): void {
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
    }, 150);
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

  private isSelectionInsideEditor(editor: HTMLElement): boolean {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      return false;
    }
    return editor.contains(sel.getRangeAt(0).commonAncestorContainer);
  }

  private restoreEditorSelection(): void {
    const editor = this.richEditorRef()?.nativeElement;
    if (!editor) {
      return;
    }
    // Si el foco y la selección ya están dentro del editor, no tocamos el Range
    // para no perder el estado de formato pendiente en cursores colapsados.
    if (document.activeElement === editor && this.isSelectionInsideEditor(editor)) {
      return;
    }

    const rangeToRestore = this.savedSelectionRange;
    editor.focus();
    const sel = window.getSelection();
    if (!sel) {
      return;
    }
    if (rangeToRestore && editor.contains(rangeToRestore.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(rangeToRestore);
    } else {
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  private syncEditorFromSignal(): void {
    setTimeout(() => {
      const editor = this.richEditorRef()?.nativeElement;
      if (!editor) {
        return;
      }
      const html = this.bodyHtml();
      const urls = this.imagePreviewUrls();
      editor.innerHTML = html.replace(
        /<img([^>]*?)data-att-id="(\d+)"([^>]*?)>/gi,
        (match, before: string, idStr: string, after: string) => {
          const url = urls.get(Number(idStr));
          if (!url) {
            return match;
          }
          const cleaned = `${before} ${after}`.replace(/\ssrc="[^"]*"/gi, '');
          return `<img src="${escapeHtml(url)}" data-att-id="${idStr}" ${cleaned.trim()}>`;
        },
      );
      this.onEditorInput();
    }, 0);
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
    this.linkPopoverOpen.set(false);
    this.activeLinkEl = null;
    this.activeImageEl = null;
    this.activeLinkHref.set(null);
    this.savedSelectionRange = null;
    this.boldActive.set(false);
    this.italicActive.set(false);
    this.underlineActive.set(false);
    this.ulActive.set(false);
    this.olActive.set(false);
    this.alignLeftActive.set(false);
    this.alignCenterActive.set(false);
    this.alignRightActive.set(false);
    this.alignJustifyActive.set(false);
    const editor = this.richEditorRef()?.nativeElement;
    if (editor) {
      editor.innerHTML = '';
    }
    this.programarPrevisualizacion();
  }

  private limpiarFormatoSeleccionado(): void {
    document.execCommand('removeFormat', false);
    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;

    const formatos: Array<{ cmd: string; selector: string }> = [
      { cmd: 'bold', selector: 'b, strong' },
      { cmd: 'italic', selector: 'i, em' },
      { cmd: 'underline', selector: 'u, ins' },
    ];

    for (const { cmd, selector } of formatos) {
      if (document.queryCommandState(cmd)) {
        document.execCommand(cmd, false);
      } else if (range && !range.collapsed && this.rangeContainsSelector(range, selector)) {
        document.execCommand(cmd, false);
        if (document.queryCommandState(cmd)) {
          document.execCommand(cmd, false);
        }
      }
    }

    document.execCommand('removeFormat', false);
  }

  private rangeContainsSelector(range: Range, selector: string): boolean {
    const editor = this.richEditorRef()?.nativeElement;
    if (!editor) {
      return false;
    }
    const ancestor =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as Element)
        : range.commonAncestorContainer.parentElement;
    if (ancestor && editor.contains(ancestor) && ancestor.closest(selector) !== null) {
      return true;
    }
    if (!(ancestor instanceof Element)) {
      return false;
    }
    return Array.from(ancestor.querySelectorAll(selector)).some((el) => {
      try {
        return range.intersectsNode(el);
      } catch {
        return false;
      }
    });
  }

  private actualizarEnlaceActivo(node: Node): void {
    const editor = this.richEditorRef()?.nativeElement;
    const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    const anchor = element?.closest('a') ?? null;
    if (anchor && editor?.contains(anchor)) {
      this.activeLinkEl = anchor;
      this.activeLinkHref.set(anchor.getAttribute('href'));
      return;
    }
    this.activeLinkEl = null;
    this.activeLinkHref.set(null);
  }

  private autoLinkificarAntesDelCursor(): void {
    const editor = this.richEditorRef()?.nativeElement;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0 || !sel.isCollapsed) {
      return;
    }
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE || !editor.contains(node)) {
      return;
    }
    const parentEl = node.parentElement;
    if (parentEl?.closest('a, .var-token') !== null) {
      return;
    }

    const textoHastaCursor = (node.textContent ?? '').slice(0, range.startOffset);
    const match = /(?:^|\s)((?:https?:\/\/|www\.)[^\s<>"]+[^\s<>".,;:!?)'])$/i.exec(
      textoHastaCursor,
    );
    if (!match) {
      return;
    }

    const urlTexto = match[1];
    const startIdx = range.startOffset - urlTexto.length;
    const href = /^https?:\/\//i.test(urlTexto) ? urlTexto : `https://${urlTexto}`;

    const urlRange = document.createRange();
    urlRange.setStart(node, startIdx);
    urlRange.setEnd(node, range.startOffset);
    urlRange.deleteContents();

    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = urlTexto;
    urlRange.insertNode(anchor);

    const afterRange = document.createRange();
    afterRange.setStartAfter(anchor);
    afterRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(afterRange);
    this.savedSelectionRange = afterRange.cloneRange();
    this.activeLinkEl = anchor;
    this.activeLinkHref.set(href);
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
