import {
  Node,
  ResizableNodeView,
  getRenderedAttributes,
  mergeAttributes,
} from '@tiptap/core';
import Image from '@tiptap/extension-image';

export const MIN_IMAGEN_ANCHO_PX = 40;
export const MAX_IMAGEN_ANCHO_PX = 616;

export function acotarAnchoImagen(valor: number): number {
  if (!Number.isFinite(valor) || valor <= 0) {
    return MAX_IMAGEN_ANCHO_PX;
  }
  return Math.max(MIN_IMAGEN_ANCHO_PX, Math.min(Math.round(valor), MAX_IMAGEN_ANCHO_PX));
}

function parseAnchoDesdeElemento(el: HTMLElement): number | null {
  const rawWidth = el.getAttribute('width')?.trim() ?? '';
  const attrMatch = /^(\d+)(?:\.\d+)?(?:px)?$/i.exec(rawWidth);
  if (attrMatch) {
    return acotarAnchoImagen(Number(attrMatch[1]));
  }

  const styleWidth = el.style.width?.trim() ?? '';
  const styleMatch = /^(\d+)(?:\.\d+)?px$/i.exec(styleWidth);
  if (styleMatch) {
    return acotarAnchoImagen(Number(styleMatch[1]));
  }

  return null;
}

export type AlineacionImagen = 'left' | 'center' | 'right';

export const CorreoImagenExtension = Image.extend({
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: {
        default: null,
        parseHTML: (el) => parseAnchoDesdeElemento(el),
        renderHTML: (attrs) => {
          const raw = attrs['width'];
          if (raw == null || raw === '') {
            return {};
          }
          const ancho = acotarAnchoImagen(Number(raw));
          return {
            width: String(ancho),
            style: `width: ${ancho}px; max-width: 100%; height: auto;`,
          };
        },
      },
      height: {
        default: null,
        renderHTML: () => ({}),
      },
      dataAttId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-att-id'),
        renderHTML: (attrs) =>
          attrs['dataAttId'] ? { 'data-att-id': String(attrs['dataAttId']) } : {},
      },
      dataAlign: {
        default: 'left',
        parseHTML: (el) => {
          const raw = (el.getAttribute('data-align') || 'left').toLowerCase();
          return raw === 'center' || raw === 'right' ? raw : 'left';
        },
        renderHTML: (attrs) => ({
          'data-align': attrs['dataAlign'] || 'left',
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'img[data-att-id]' }, { tag: 'img[src]:not([src^="data:"])' }];
  },

  addNodeView() {
    if (typeof document === 'undefined') {
      return null;
    }

    return ({ node, getPos, HTMLAttributes, editor }) => {
      const img = document.createElement('img');
      img.draggable = false;
      img.className = 'embedded-mail-img';

      const resizeManagedAttributes = new Set(['src', 'width', 'height', 'style']);

      const aplicarAtributos = (attrs: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(attrs)) {
          if (resizeManagedAttributes.has(key)) {
            continue;
          }
          if (value != null) {
            img.setAttribute(key, String(value));
          }
        }
      };

      const sincronizarSrc = (src: unknown) => {
        if (typeof src === 'string' && src !== '') {
          if (img.getAttribute('src') !== src) {
            img.src = src;
          }
          return;
        }
        img.removeAttribute('src');
      };

      const aplicarTamanoVisual = (width: unknown) => {
        if (typeof width === 'number' && Number.isFinite(width) && width > 0) {
          const ancho = acotarAnchoImagen(width);
          img.style.width = `${ancho}px`;
          img.style.height = 'auto';
          img.style.maxWidth = '100%';
        } else {
          img.style.width = '';
          img.style.height = 'auto';
          img.style.maxWidth = '100%';
        }
      };

      const mergedAttributes = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes);
      aplicarAtributos(mergedAttributes);
      sincronizarSrc(mergedAttributes['src']);
      aplicarTamanoVisual(node.attrs['width']);

      let previousHTMLAttributes: Record<string, unknown> = { ...HTMLAttributes };

      const nodeView = new ResizableNodeView({
        element: img,
        editor,
        node,
        getPos,
        onResize: (width) => {
          const ancho = acotarAnchoImagen(width);
          img.style.width = `${ancho}px`;
          img.style.height = 'auto';
        },
        onCommit: (width) => {
          const pos = getPos();
          if (pos === undefined) {
            return;
          }
          const ancho = acotarAnchoImagen(width);
          editor
            .chain()
            .setNodeSelection(pos)
            .updateAttributes(this.name, { width: ancho, height: null })
            .run();
        },
        onUpdate: (updatedNode) => {
          if (updatedNode.type !== node.type) {
            return false;
          }

          const extensionAttributes = editor.extensionManager.attributes.filter(
            (attribute) => attribute.type === updatedNode.type.name,
          );
          const newHTMLAttributes = getRenderedAttributes(updatedNode, extensionAttributes);

          Object.keys(previousHTMLAttributes).forEach((key) => {
            if (!resizeManagedAttributes.has(key) && !(key in newHTMLAttributes)) {
              img.removeAttribute(key);
            }
          });

          Object.entries(newHTMLAttributes).forEach(([key, value]) => {
            if (resizeManagedAttributes.has(key)) {
              return;
            }
            if (value != null) {
              img.setAttribute(key, String(value));
            } else {
              img.removeAttribute(key);
            }
          });

          sincronizarSrc(newHTMLAttributes['src']);
          aplicarTamanoVisual(updatedNode.attrs['width']);
          nodeView.dom.dataset['align'] = String(updatedNode.attrs['dataAlign'] || 'left');
          previousHTMLAttributes = newHTMLAttributes;
          return true;
        },
        options: {
          directions: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
          min: { width: MIN_IMAGEN_ANCHO_PX, height: 24 },
          max: { width: MAX_IMAGEN_ANCHO_PX, height: 2000 },
          preserveAspectRatio: true,
        },
      });

      nodeView.dom.dataset['align'] = String(node.attrs['dataAlign'] || 'left');
      return nodeView;
    };
  },
});

export const VariableTokenExtension = Node.create({
  name: 'varToken',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      dataVar: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-var') ?? '',
      },
      label: {
        default: '',
        parseHTML: (el) => el.textContent?.trim() || el.getAttribute('data-var') || '',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-var]' }];
  },

  renderHTML({ node }) {
    const dataVar = String(node.attrs['dataVar'] ?? '');
    const label = String(node.attrs['label'] || dataVar);
    return [
      'span',
      {
        'data-var': dataVar,
        class: 'var-token',
        contenteditable: 'false',
      },
      label,
    ];
  },
});
