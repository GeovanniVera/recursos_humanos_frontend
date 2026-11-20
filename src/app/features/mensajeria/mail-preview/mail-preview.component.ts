import { Component, input } from '@angular/core';
import { SafeHtml } from '@angular/platform-browser';

/**
 * Institutional email preview frame shared across messaging compose and authorizations drawers.
 */
@Component({
  selector: 'app-mail-preview',
  templateUrl: './mail-preview.component.html',
  styleUrl: './mail-preview.component.scss',
})
export class MailPreview {
  readonly recipient = input<string | null>(null);
  readonly folio = input<string | null>(null);
  readonly subject = input('');
  readonly bodyHtml = input<SafeHtml>('');

  protected readonly fechaTexto = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}
