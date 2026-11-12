import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarStateService } from '../../core/layout/sidebar-state.service';
import { Sidebar } from '../sidebar/sidebar.component';
import { Topbar } from '../topbar/topbar.component';

/**
 * Application shell: a fixed navigation column and a routed content column.
 *
 * The sidebar column starts at the left viewport edge with no padding and no
 * gap; only the content column is padded. The column widths come from tokens so
 * collapsing the drawer animates through a single declaration.
 *
 * Desktop-first on purpose. The design canvas is a fixed 1280px desktop and
 * this iteration adds no breakpoints.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, Sidebar, Topbar],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShell {
  private readonly sidebarState = inject(SidebarStateService);

  /** `true` while the sidebar renders as the icon-only rail. */
  readonly collapsed = this.sidebarState.collapsed;
}
