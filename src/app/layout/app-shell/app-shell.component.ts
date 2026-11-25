import { Component, inject, viewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarStateService } from '../../core/layout/sidebar-state.service';
import { Sidebar } from '../sidebar/sidebar.component';
import { Topbar } from '../topbar/topbar.component';

/**
 * Application shell: responsive navigation drawer and routed content column.
 *
 * Desktop (`>= 1024px`) preserves the user's drawer/rail preference; tablet
 * (`768px–1023px`) auto-collapses the column to the 76px rail via
 * `effectiveCollapsed`; mobile (`<= 767px`) switches to a single-column layout
 * with an off-canvas sidebar drawer, scrim, `inert` when closed, and Escape
 * focus restoration back to the Topbar menu button.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, Sidebar, Topbar],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class AppShell {
  private readonly sidebarState = inject(SidebarStateService);
  private readonly topbar = viewChild(Topbar);

  /** `true` while the sidebar renders as the icon-only rail (desktop toggle or tablet). */
  readonly collapsed = this.sidebarState.effectiveCollapsed;
  readonly isMobile = this.sidebarState.isMobile;
  readonly mobileOpen = this.sidebarState.mobileOpen;

  closeMobile(restoreFocus = false): void {
    this.sidebarState.closeMobile();
    if (restoreFocus) {
      this.topbar()?.focusMenuButton();
    }
  }

  onEscape(): void {
    if (this.isMobile() && this.mobileOpen()) {
      this.closeMobile(true);
    }
  }
}
