import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Editor } from '@tiptap/core';
import TextAlign from '@tiptap/extension-text-align';
import { BackgroundColor, Color, TextStyle } from '@tiptap/extension-text-style';
import StarterKit from '@tiptap/starter-kit';
import {
  VariableDinamica,
  escapeHtml,
  normalizarFichasEditorHtml,
} from '../../../core/mensajeria/mensajeria-token.helper';
import { ComunicadoArchivo } from '../../../core/mensajeria/mensajeria.models';
import { Button } from '../../../shared/ui/button/button.component';
import {
  AlineacionImagen,
  CorreoImagenExtension,
  MAX_IMAGEN_ANCHO_PX,
  VariableTokenExtension,
  acotarAnchoImagen,
} from './tiptap-extensions';

interface ColorPreset {
  readonly label: string;
  readonly value: string | null;
  readonly swatch: string;
}

const IMAGE_WIDTH_PRESETS: readonly { label: string; width: number }[] = [
  { label: '25%', width: 154 },
  { label: '50%', width: 308 },
  { label: '75%', width: 462 },
  { label: '100%', width: 616 },
];

const COLOR_PRESETS: readonly ColorPreset[] = [
  { label: 'Predeterminado', value: null, swatch: '#1f1a1c' },
  { label: 'Guinda UTN', value: '#5a0e24', swatch: '#5a0e24' },
  { label: 'Vino', value: '#7a1531', swatch: '#7a1531' },
  { label: 'Dorado', value: '#9a7414', swatch: '#9a7414' },
  { label: 'Azul', value: '#1d4ed8', swatch: '#1d4ed8' },
  { label: 'Verde', value: '#15803d', swatch: '#15803d' },
];

const HIGHLIGHT_PRESETS: readonly ColorPreset[] = [
  { label: 'Sin resaltado', value: null, swatch: '#ffffff' },
  { label: 'Amarillo', value: '#fef08a', swatch: '#fef08a' },
  { label: 'Rosa suave', value: '#fce7f3', swatch: '#fce7f3' },
  { label: 'Menta', value: '#dcfce7', swatch: '#dcfce7' },
  { label: 'Cielo', value: '#dbeafe', swatch: '#dbeafe' },
];

@Component({
  selector: 'app-rich-mail-editor',
  imports: [FormsModule, Button],
  templateUrl: './rich-mail-editor.component.html',
  styleUrl: './rich-mail-editor.component.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class RichMailEditor implements AfterViewInit {
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly editorHostRef = viewChild<ElementRef<HTMLDivElement>>('editorHost');
  private readonly imageInputRef = viewChild<ElementRef<HTMLInputElement>>('imageInput');

  readonly placeholder = input(
    'Escribe aquí el cuerpo del comunicado oficial. Puedes dar formato, pegar imágenes o insertar datos del trabajador...',
  );
  readonly imagePreviewUrls = input<ReadonlyMap<number, string>>(new Map());

  readonly htmlChange = output<string>();
  readonly statsChange = output<{ words: number; chars: number }>();
  readonly filesPastedOrDropped = output<File[]>();

  readonly colorPresets = COLOR_PRESETS;
  readonly highlightPresets = HIGHLIGHT_PRESETS;
  readonly imageWidthPresets = IMAGE_WIDTH_PRESETS;
  readonly maxImageWidth = MAX_IMAGEN_ANCHO_PX;

  // Estados de barra de herramientas (estilo TipTap Simple Editor)
  readonly isEmpty = signal(true);
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  readonly headingLevel = signal<0 | 2 | 3>(0);
  readonly boldActive = signal(false);
  readonly italicActive = signal(false);
  readonly strikeActive = signal(false);
  readonly underlineActive = signal(false);
  readonly blockquoteActive = signal(false);
  readonly ulActive = signal(false);
  readonly olActive = signal(false);
  readonly alignActive = signal<'left' | 'center' | 'right' | 'justify'>('left');
  readonly activeColor = signal<string | null>(null);
  readonly activeHighlight = signal<string | null>(null);

  // Popovers de barra
  readonly headingMenuOpen = signal(false);
  readonly listMenuOpen = signal(false);
  readonly stylePopoverOpen = signal(false);
  readonly linkPopoverOpen = signal(false);
  readonly linkText = signal('');
  readonly linkUrl = signal('');
  readonly activeLinkHref = signal<string | null>(null);

  // Barra contextual de imagen seleccionada
  readonly selectedImageActive = signal(false);
  readonly selectedImageWidth = signal<number | null>(null);
  readonly selectedImageAlign = signal<AlineacionImagen>('left');

  private editor: Editor | null = null;
  private pendingHtml: string | null = null;
  private suppressEmission = false;

  constructor() {
    effect(() => {
      const urls = this.imagePreviewUrls();
      this.sincronizarUrlsImagenesEnDocumento(urls);
    });

    this.destroyRef.onDestroy(() => {
      this.editor?.destroy();
      this.editor = null;
    });
  }

  ngAfterViewInit(): void {
    const host = this.editorHostRef()?.nativeElement;
    if (!host) {
      return;
    }

    const editor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] },
          codeBlock: false,
          code: false,
          link: {
            openOnClick: false,
            autolink: true,
            linkOnPaste: true,
            HTMLAttributes: {
              target: '_blank',
              rel: 'noopener noreferrer',
            },
          },
        }),
        TextStyle,
        Color,
        BackgroundColor,
        TextAlign.configure({
          types: ['heading', 'paragraph'],
        }),
        CorreoImagenExtension.configure({
          inline: false,
          allowBase64: false,
          HTMLAttributes: {
            class: 'embedded-mail-img',
          },
        }),
        VariableTokenExtension,
      ],
      content: this.pendingHtml ?? '<p></p>',
      editorProps: {
        attributes: {
          class: 'tiptap-prose',
        },
        handlePaste: (_view, event) => this.manejarPaste(event),
        handleDrop: (_view, event) => this.manejarDrop(event),
      },
      onUpdate: () => {
        if (this.suppressEmission) {
          return;
        }
        this.emitirCambios();
        this.actualizarEstadoToolbar();
      },
      onSelectionUpdate: () => {
        if (this.suppressEmission) {
          return;
        }
        this.actualizarEstadoToolbar();
      },
      onTransaction: () => {
        if (this.suppressEmission) {
          return;
        }
        this.actualizarEstadoToolbar();
      },
    });

    this.editor = editor;
    this.pendingHtml = null;
    this.sincronizarUrlsImagenesEnDocumento(this.imagePreviewUrls());
    queueMicrotask(() => {
      if (this.editor) {
        this.actualizarEstadoToolbar();
      }
    });
  }

  setHtml(rawHtml: string): void {
    const normalized = normalizarFichasEditorHtml(rawHtml || '');
    const withBlobUrls = this.inyectarUrlsEnHtml(normalized, this.imagePreviewUrls());

    if (!this.editor) {
      this.pendingHtml = withBlobUrls || '<p></p>';
      return;
    }

    this.suppressEmission = true;
    this.editor.commands.setContent(withBlobUrls || '<p></p>', { emitUpdate: false });
    this.suppressEmission = false;
    this.actualizarEstadoToolbar();
  }

  getHtml(): string {
    if (!this.editor) {
      return this.pendingHtml ?? '';
    }
    return this.editor.isEmpty ? '' : this.editor.getHTML();
  }

  focus(): void {
    this.cerrarPopovers();
    this.editor?.commands.focus();
  }

  insertVariable(variable: VariableDinamica): void {
    if (!this.editor) {
      return;
    }
    this.cerrarPopovers();
    this.editor
      .chain()
      .focus()
      .insertContent([
        {
          type: 'varToken',
          attrs: { dataVar: variable.token, label: variable.etiqueta },
        },
        { type: 'text', text: ' ' },
      ])
      .run();
  }

  insertAttachedImage(
    archivo: ComunicadoArchivo,
    srcUrl: string,
    naturalWidth?: number,
  ): void {
    if (!this.editor) {
      return;
    }
    const width = acotarAnchoImagen(
      naturalWidth && naturalWidth > 0 ? Math.min(naturalWidth, MAX_IMAGEN_ANCHO_PX) : 480,
    );
    this.editor
      .chain()
      .focus()
      .insertContent([
        {
          type: 'image',
          attrs: {
            src: srcUrl,
            alt: archivo.nombre_original,
            dataAttId: String(archivo.id),
            dataAlign: 'left',
            width,
          },
        },
        { type: 'paragraph' },
      ])
      .run();
  }

  removeImagesByAttachmentId(archivoId: number): void {
    const editor = this.editor;
    if (!editor) {
      return;
    }

    const { tr, doc } = editor.state;
    const posiciones: { from: number; to: number }[] = [];

    doc.descendants((node, pos) => {
      if (node.type.name === 'image' && Number(node.attrs['dataAttId']) === archivoId) {
        posiciones.push({ from: pos, to: pos + node.nodeSize });
      }
    });

    if (posiciones.length === 0) {
      return;
    }

    for (let i = posiciones.length - 1; i >= 0; i--) {
      tr.delete(posiciones[i].from, posiciones[i].to);
    }

    editor.view.dispatch(tr);
  }

  undo(): void {
    this.cerrarPopovers();
    this.editor?.chain().focus().undo().run();
  }

  redo(): void {
    this.cerrarPopovers();
    this.editor?.chain().focus().redo().run();
  }

  toggleHeadingMenu(): void {
    const next = !this.headingMenuOpen();
    this.cerrarPopovers();
    this.headingMenuOpen.set(next);
  }

  toggleListMenu(): void {
    const next = !this.listMenuOpen();
    this.cerrarPopovers();
    this.listMenuOpen.set(next);
  }

  toggleStylePopover(): void {
    const next = !this.stylePopoverOpen();
    this.cerrarPopovers();
    this.stylePopoverOpen.set(next);
  }

  setHeading(level: 0 | 2 | 3): void {
    this.headingMenuOpen.set(false);
    const chain = this.editor?.chain().focus();
    if (!chain) {
      return;
    }
    if (level === 0) {
      chain.setParagraph().run();
    } else {
      chain.toggleHeading({ level }).run();
    }
  }

  toggleMark(mark: 'bold' | 'italic' | 'underline' | 'strike' | 'blockquote'): void {
    this.cerrarPopovers();
    const chain = this.editor?.chain().focus();
    if (!chain) {
      return;
    }
    switch (mark) {
      case 'bold':
        chain.toggleBold().run();
        break;
      case 'italic':
        chain.toggleItalic().run();
        break;
      case 'underline':
        chain.toggleUnderline().run();
        break;
      case 'strike':
        chain.toggleStrike().run();
        break;
      case 'blockquote':
        chain.toggleBlockquote().run();
        break;
    }
  }

  toggleList(tipo: 'bullet' | 'ordered'): void {
    this.listMenuOpen.set(false);
    const chain = this.editor?.chain().focus();
    if (!chain) {
      return;
    }
    if (tipo === 'bullet') {
      chain.toggleBulletList().run();
    } else {
      chain.toggleOrderedList().run();
    }
  }

  insertHorizontalRule(): void {
    this.cerrarPopovers();
    this.editor?.chain().focus().setHorizontalRule().run();
  }

  setAlign(align: 'left' | 'center' | 'right' | 'justify'): void {
    this.cerrarPopovers();
    const editor = this.editor;
    if (!editor) {
      return;
    }
    if (editor.isActive('image') && align !== 'justify') {
      editor.chain().focus().updateAttributes('image', { dataAlign: align }).run();
      return;
    }
    editor.chain().focus().setTextAlign(align).run();
  }

  setImageWidth(width: number): void {
    const editor = this.editor;
    if (!editor || !editor.isActive('image')) {
      return;
    }
    const clamped = acotarAnchoImagen(width);
    editor.chain().focus().updateAttributes('image', { width: clamped, height: null }).run();
  }

  removeSelectedImage(): void {
    const editor = this.editor;
    if (!editor || !editor.isActive('image')) {
      return;
    }
    editor.chain().focus().deleteSelection().run();
  }

  applyTextColor(color: string | null): void {
    const chain = this.editor?.chain().focus();
    if (!chain) {
      return;
    }
    if (color === null) {
      chain.unsetColor().run();
    } else {
      chain.setColor(color).run();
    }
    this.stylePopoverOpen.set(false);
  }

  applyHighlightColor(color: string | null): void {
    const chain = this.editor?.chain().focus();
    if (!chain) {
      return;
    }
    if (color === null) {
      chain.unsetBackgroundColor().run();
    } else {
      chain.setBackgroundColor(color).run();
    }
    this.stylePopoverOpen.set(false);
  }

  clearFormatting(): void {
    this.cerrarPopovers();
    this.editor?.chain().focus().unsetAllMarks().clearNodes().run();
  }

  openImagePicker(): void {
    this.cerrarPopovers();
    this.imageInputRef()?.nativeElement.click();
  }

  onImagePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const imagenes = Array.from(input.files).filter((f) => f.type.startsWith('image/'));
      if (imagenes.length > 0) {
        this.filesPastedOrDropped.emit(imagenes);
      }
      input.value = '';
    }
  }

  toggleLinkPopover(force?: boolean): void {
    const next = force ?? !this.linkPopoverOpen();
    this.cerrarPopovers();
    if (next && this.editor) {
      const currentHref = this.editor.getAttributes('link')['href'] as string | undefined;
      if (currentHref) {
        this.linkUrl.set(currentHref);
      }
      const { from, to } = this.editor.state.selection;
      if (from !== to) {
        this.linkText.set(this.editor.state.doc.textBetween(from, to, ' '));
      }
    }
    this.linkPopoverOpen.set(next);
  }

  confirmInsertLink(): void {
    const editor = this.editor;
    if (!editor) {
      return;
    }
    let url = this.linkUrl().trim();
    if (!url) {
      return;
    }
    if (!/^(https?:\/\/|mailto:)/i.test(url)) {
      url = `https://${url}`;
    }
    const label = this.linkText().trim();
    const { from, to } = editor.state.selection;

    if (from === to) {
      const texto = label || url;
      editor
        .chain()
        .focus()
        .insertContent(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(texto)}</a> `)
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }

    this.linkText.set('');
    this.linkUrl.set('');
    this.linkPopoverOpen.set(false);
  }

  openActiveLink(): void {
    const href = this.activeLinkHref();
    if (!href) {
      return;
    }
    const normalized = /^(https?:\/\/|mailto:)/i.test(href) ? href : `https://${href}`;
    window.open(normalized, '_blank', 'noopener,noreferrer');
  }

  unlinkActive(): void {
    this.editor?.chain().focus().extendMarkRange('link').unsetLink().run();
  }

  private cerrarPopovers(): void {
    this.headingMenuOpen.set(false);
    this.listMenuOpen.set(false);
    this.stylePopoverOpen.set(false);
    this.linkPopoverOpen.set(false);
  }

  onDocumentClick(event: MouseEvent): void {
    const target = event.target as globalThis.Node | null;
    if (target && !this.hostEl.nativeElement.contains(target)) {
      this.cerrarPopovers();
    }
  }

  private manejarPaste(event: ClipboardEvent): boolean {
    const dt = event.clipboardData;
    if (!dt) {
      return false;
    }

    const imagenes: File[] = [];

    for (const item of Array.from(dt.items ?? [])) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          imagenes.push(this.asegurarNombreArchivo(file));
        }
      }
    }

    if (imagenes.length === 0 && dt.files && dt.files.length > 0) {
      for (const file of Array.from(dt.files)) {
        if (file.type.startsWith('image/')) {
          imagenes.push(this.asegurarNombreArchivo(file));
        }
      }
    }

    if (imagenes.length > 0) {
      event.preventDefault();
      this.filesPastedOrDropped.emit(imagenes);
      return true;
    }

    const html = dt.getData('text/html');
    if (html && /<img[^>]+src=["']data:image\//i.test(html)) {
      const extraidos = this.extraerImagenesBase64DeHtml(html);
      if (extraidos.length > 0) {
        event.preventDefault();
        this.filesPastedOrDropped.emit(extraidos);
        return true;
      }
    }

    return false;
  }

  private manejarDrop(event: DragEvent): boolean {
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) {
      return false;
    }

    const imagenes = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imagenes.length === 0) {
      return false;
    }

    event.preventDefault();
    this.filesPastedOrDropped.emit(imagenes.map((f) => this.asegurarNombreArchivo(f)));
    return true;
  }

  private asegurarNombreArchivo(file: File): File {
    if (file.name && file.name !== 'image.png') {
      return file;
    }
    const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    return new File([file], `imagen-pegada-${Date.now()}.${ext}`, { type: file.type });
  }

  private extraerImagenesBase64DeHtml(html: string): File[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const archivos: File[] = [];

    for (const img of Array.from(doc.querySelectorAll('img'))) {
      const src = img.getAttribute('src') ?? '';
      const match = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/i.exec(src);
      if (!match) {
        continue;
      }
      try {
        const mime = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
        const binary = atob(match[2].replace(/\s+/g, ''));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
        archivos.push(
          new File([bytes], `imagen-pegada-${Date.now()}-${archivos.length + 1}.${ext}`, {
            type: mime,
          }),
        );
      } catch {
        // Ignora data URIs corruptos
      }
    }

    return archivos;
  }

  private sincronizarUrlsImagenesEnDocumento(urls: ReadonlyMap<number, string>): void {
    const editor = this.editor;
    if (!editor || urls.size === 0) {
      return;
    }

    const { tr, doc } = editor.state;
    let changed = false;

    doc.descendants((node, pos) => {
      if (node.type.name !== 'image') {
        return;
      }
      const attId = Number(node.attrs['dataAttId']);
      if (!Number.isFinite(attId) || attId <= 0) {
        return;
      }
      const url = urls.get(attId);
      if (url && node.attrs['src'] !== url) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: url });
        changed = true;
      }
    });

    if (changed) {
      this.suppressEmission = true;
      editor.view.dispatch(tr);
      this.suppressEmission = false;
    }
  }

  private inyectarUrlsEnHtml(rawHtml: string, urls: ReadonlyMap<number, string>): string {
    if (!rawHtml || urls.size === 0) {
      return rawHtml;
    }
    return rawHtml.replace(
      /<img([^>]*?)data-att-id="(\d+)"([^>]*?)>/gi,
      (match, before: string, idStr: string, after: string) => {
        const url = urls.get(Number(idStr));
        if (!url) {
          return match;
        }
        const cleaned = `${before} ${after}`.replace(/\ssrc="[^"]*"/gi, '').trim();
        return `<img src="${escapeHtml(url)}" data-att-id="${idStr}" ${cleaned}>`;
      },
    );
  }

  private emitirCambios(): void {
    if (this.suppressEmission || !this.editor) {
      return;
    }
    this.htmlChange.emit(this.editor.isEmpty ? '' : this.editor.getHTML());
    this.emitirStats();
  }

  private emitirStats(): void {
    if (!this.editor) {
      return;
    }
    const plain = this.editor.getText().trim();
    const words = plain ? plain.split(/\s+/).length : 0;
    this.statsChange.emit({ words, chars: plain.length });
  }

  private actualizarEstadoToolbar(): void {
    const editor = this.editor;
    if (!editor) {
      return;
    }

    this.isEmpty.set(editor.isEmpty);
    this.canUndo.set(editor.can().undo());
    this.canRedo.set(editor.can().redo());

    if (editor.isActive('heading', { level: 2 })) {
      this.headingLevel.set(2);
    } else if (editor.isActive('heading', { level: 3 })) {
      this.headingLevel.set(3);
    } else {
      this.headingLevel.set(0);
    }

    this.boldActive.set(editor.isActive('bold'));
    this.italicActive.set(editor.isActive('italic'));
    this.strikeActive.set(editor.isActive('strike'));
    this.underlineActive.set(editor.isActive('underline'));
    this.blockquoteActive.set(editor.isActive('blockquote'));
    this.ulActive.set(editor.isActive('bulletList'));
    this.olActive.set(editor.isActive('orderedList'));

    const textAttrs = editor.getAttributes('textStyle');
    this.activeColor.set((textAttrs['color'] as string | undefined) ?? null);
    this.activeHighlight.set((textAttrs['backgroundColor'] as string | undefined) ?? null);

    const linkHref = editor.getAttributes('link')['href'] as string | undefined;
    this.activeLinkHref.set(linkHref ?? null);

    const isImg = editor.isActive('image');
    this.selectedImageActive.set(isImg);
    if (isImg) {
      const attrs = editor.getAttributes('image');
      const w = attrs['width'] ? acotarAnchoImagen(Number(attrs['width'])) : null;
      this.selectedImageWidth.set(w);
      const al = (attrs['dataAlign'] || 'left') as AlineacionImagen;
      this.selectedImageAlign.set(al);
      this.alignActive.set(al);
      return;
    }

    this.selectedImageWidth.set(null);

    if (editor.isActive({ textAlign: 'center' })) {
      this.alignActive.set('center');
    } else if (editor.isActive({ textAlign: 'right' })) {
      this.alignActive.set('right');
    } else if (editor.isActive({ textAlign: 'justify' })) {
      this.alignActive.set('justify');
    } else {
      this.alignActive.set('left');
    }
  }
}
