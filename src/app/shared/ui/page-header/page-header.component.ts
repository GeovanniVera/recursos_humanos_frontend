import { Component, input } from '@angular/core';

/**
 * Editorial head of a routed screen: overline, title and one optional action.
 *
 * It is the archive's letterhead. The eyebrow is typed and tracked out like the
 * index labels of the drawer; the title is the page's only `h1`; the subtitle is
 * capped at a readable measure instead of running the width of a wide monitor.
 *
 * Everything is painted from theme roles, so it answers `guinda`, `light` and
 * `dark` exactly as the shell around it does.
 */
@Component({
  selector: 'app-page-header',
  templateUrl: './page-header.component.html',
  styleUrl: './page-header.component.scss',
})
export class PageHeader {
  /** Index label above the title, e.g. `Expedientes · Recursos Humanos`. */
  readonly eyebrow = input.required<string>();
  /** Page title. Rendered as the screen's only `h1`. */
  readonly title = input.required<string>();
  /** One line that says what the screen is for. Omitted, nothing is rendered. */
  readonly subtitle = input<string>();
}
