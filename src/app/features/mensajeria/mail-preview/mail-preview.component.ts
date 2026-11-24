import { Component, computed, input } from '@angular/core';
import { SafeHtml } from '@angular/platform-browser';

/**
 * Institutional email preview frame shared across messaging compose, authorizations,
 * and completeness reminder previews.
 */
@Component({
  selector: 'app-mail-preview',
  templateUrl: './mail-preview.component.html',
  styleUrl: './mail-preview.component.scss',
})
export class MailPreview {
  readonly recipient = input<string | null>(null);
  readonly folio = input<string | null>(null);
  readonly badgeText = input<string | null>(null);
  readonly greeting = input<string | null>(null);
  readonly subject = input('');
  readonly bodyHtml = input<SafeHtml>('');
  readonly noticeText = input<string>(
    'Para cualquier duda o aclaración respecto a este aviso, acude directamente a la Dirección de Administración y Finanzas / Departamento de Recursos Humanos.',
  );
  readonly showNotice = input(true);

  protected readonly resolvedBadge = computed(() => {
    const custom = this.badgeText();
    if (custom) {
      return custom;
    }
    const f = this.folio();
    return f ? `Aviso Oficial · ${f}` : 'Comunicado Institucional';
  });

  protected readonly fechaTexto = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}
