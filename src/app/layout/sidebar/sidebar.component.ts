import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SidebarStateService } from '../../core/layout/sidebar-state.service';
import { BrandLogos } from '../../shared/ui/brand-logos/brand-logos.component';

/**
 * Main navigation drawer.
 *
 * A square panel pinned to the left edge of the viewport, with two widths: the
 * full drawer (icons plus labels) and the icon-only rail. The width itself is
 * owned by `SidebarStateService`; this component only reads it and asks for a
 * change. The entrance reuses the global `.enter-drawer` utility, so the
 * slide-in never redefines a keyframe.
 *
 * The drawer has three regions: the identity header, the scrolling navigation
 * tree and the pinned footer with the account entries and the session card.
 */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, BrandLogos],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  host: {
    class: 'enter-drawer',
    '[class.is-collapsed]': 'collapsed()',
  },
})
export class Sidebar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly sidebarState = inject(SidebarStateService);

  /** `true` when the drawer renders as the icon-only rail. */
  readonly collapsed = this.sidebarState.collapsed;

  /**
   * State of the `Empleados` branch. Starts open so the hierarchy is visible on
   * first paint: a collapsed branch would hide two of the three destinations.
   */
  readonly submenuOpen = signal(true);

  /** Display name from the session, or a neutral placeholder before it loads. */
  readonly userName = computed(() => this.auth.sesion()?.nombre ?? 'Nombre Apellido');

  /** Role from the session, or a neutral placeholder before it loads. */
  readonly userRole = computed(() => this.auth.sesion()?.rol ?? 'Administrador');

  /** Two initials for the avatar; `NA` while the session is not loaded. */
  readonly initials = computed(() => {
    const name = this.auth.sesion()?.nombre?.trim();
    if (!name) {
      return 'NA';
    }
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  });

  /** Flips the drawer between the full width and the rail. */
  toggleCollapsed(): void {
    this.sidebarState.toggle();
  }

  /** Opens or closes the `Empleados` branch. */
  toggleSubmenu(): void {
    this.submenuOpen.update((open) => !open);
  }

  /**
   * Destroys the session and ejects the user.
   *
   * The navigation sits in `finalize`, not in `next`: `AuthService` already
   * clears the local state whatever the backend answers, so a failed logout
   * must still leave the user on the login screen instead of keeping them in a
   * shell they no longer have credentials for.
   */
  cerrarSesion(): void {
    this.auth
      .cerrarSesion()
      .pipe(finalize(() => void this.router.navigate(['/login'])))
      // A rejected logout needs no message here: the exit already happened.
      .subscribe({ error: () => undefined });
  }
}
