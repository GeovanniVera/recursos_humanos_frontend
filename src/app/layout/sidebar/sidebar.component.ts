import {
  Component,
  DestroyRef,
  ElementRef,
  WritableSignal,
  afterNextRender,
  computed,
  effect,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, finalize } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { SidebarStateService } from '../../core/layout/sidebar-state.service';
import { BrandLogos } from '../../shared/ui/brand-logos/brand-logos.component';

/**
 * Main navigation drawer.
 *
 * Renders in three responsive modes driven by `SidebarStateService`:
 * - Desktop (`>= 1024px`): full drawer or user-toggled 76px icon rail.
 * - Tablet (`768px–1023px`): auto-collapsed 76px icon rail (`effectiveCollapsed`)
 *   preserving desktop `localStorage` preference.
 * - Mobile (`<= 767px`): full-label off-canvas drawer controlled by `mobileOpen`.
 */
interface PillGroupState {
  top: WritableSignal<number>;
  left: WritableSignal<number>;
  width: WritableSignal<number>;
  height: WritableSignal<number>;
  visible: WritableSignal<boolean>;
  timer: ReturnType<typeof setTimeout> | null;
  hasAnimatedOnce: boolean;
}

export interface RailTooltipState {
  key: string;
  text: string;
  top: number;
  left: number;
}

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, BrandLogos],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  host: {
    class: 'enter-drawer',
    '[class.is-collapsed]': 'collapsed()',
    '[class.is-mobile-open]': 'mobileOpen()',
    '(transitionend)': 'onHostTransitionEnd($event)',
    '(mouseover)': 'onHostMouseOver($event)',
    '(mouseout)': 'onHostMouseOut($event)',
    '(focusin)': 'onHostFocusIn($event)',
    '(focusout)': 'onHostFocusOut($event)',
    '(keydown.escape)': 'hideTooltip()',
  },
})
export class Sidebar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly sidebarState = inject(SidebarStateService);
  private readonly elementRef = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  private readonly mobileCloseButton = viewChild<ElementRef<HTMLButtonElement>>('mobileCloseBtn');

  /** Emitted when the user presses the mobile drawer close button. */
  readonly mobileClose = output<void>();

  /** Effective rail state: true on tablet or when collapsed on desktop. */
  readonly collapsed = this.sidebarState.effectiveCollapsed;
  readonly isTablet = this.sidebarState.isTablet;
  readonly isMobile = this.sidebarState.isMobile;
  readonly mobileOpen = this.sidebarState.mobileOpen;

  /**
   * State of the `Empleados` branch. Starts open so the hierarchy is visible on
   * first paint: a collapsed branch would hide two of the three destinations.
   */
  readonly submenuOpen = signal(true);

  /** Sliding pill indicator coordinates and visibility (`nav`). */
  readonly pillTop = signal(0);
  readonly pillLeft = signal(0);
  readonly pillWidth = signal(0);
  readonly pillHeight = signal(44);
  readonly pillVisible = signal(false);

  /** Sliding pill indicator coordinates and visibility (`footer`). */
  readonly footerPillTop = signal(0);
  readonly footerPillLeft = signal(0);
  readonly footerPillWidth = signal(0);
  readonly footerPillHeight = signal(44);
  readonly footerPillVisible = signal(false);

  /** Accessible tooltip state shown next to the 76px collapsed rail. */
  readonly railTooltip = signal<RailTooltipState | null>(null);

  private readonly navPillGroup: PillGroupState = {
    top: this.pillTop,
    left: this.pillLeft,
    width: this.pillWidth,
    height: this.pillHeight,
    visible: this.pillVisible,
    timer: null,
    hasAnimatedOnce: false,
  };

  private readonly footerPillGroup: PillGroupState = {
    top: this.footerPillTop,
    left: this.footerPillLeft,
    width: this.footerPillWidth,
    height: this.footerPillHeight,
    visible: this.footerPillVisible,
    timer: null,
    hasAnimatedOnce: false,
  };

  private scheduleTimer: ReturnType<typeof setTimeout> | null = null;
  private focusTimer: ReturnType<typeof setTimeout> | null = null;
  private hoverTarget: HTMLElement | null = null;
  private focusTarget: HTMLElement | null = null;

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        if (this.isMobile() && this.mobileOpen()) {
          this.sidebarState.closeMobile();
        }
        this.schedulePillUpdate(false);
      });

    // Recalculate indicator geometry immediately whenever sidebar width/mode changes,
    // and dismiss any rail tooltip once expanded or inside the mobile drawer.
    effect(() => {
      const isRail = this.collapsed() && !this.isMobile();
      this.mobileOpen();
      if (!isRail) {
        this.hideTooltip();
      }
      this.schedulePillUpdate(true);
    });

    // Move focus inside the mobile drawer once opened so keyboard users enter the menu.
    effect(() => {
      if (this.isMobile() && this.mobileOpen()) {
        if (this.focusTimer !== null) {
          clearTimeout(this.focusTimer);
        }
        this.focusTimer = setTimeout(() => {
          this.mobileCloseButton()?.nativeElement.focus();
          this.focusTimer = null;
        }, 0);
      }
    });

    afterNextRender(() => {
      this.syncPillPosition(true);
      this.setupResizeObserver();
    });

    this.destroyRef.onDestroy(() => {
      this.clearTimers();
    });
  }

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

  /** Flips the drawer between the full width and the rail on desktop. */
  toggleCollapsed(): void {
    this.sidebarState.toggle();
    this.schedulePillUpdate(true);
  }

  /** Requests closing the mobile off-canvas drawer and restoring trigger focus. */
  requestMobileClose(): void {
    this.mobileClose.emit();
  }

  /** Opens or closes the `Empleados` branch. */
  toggleSubmenu(): void {
    this.submenuOpen.update((open) => !open);
    this.schedulePillUpdate(false);
  }

  /** Captures clicks on nav items to trigger pill animation and auto-close mobile drawer. */
  onNavClick(event: MouseEvent): void {
    this.handleGroupClick(event, '#sidebar-nav', this.navPillGroup);
  }

  /** Animates footer active pill and closes mobile drawer when clicking footer destinations. */
  onFooterNavClick(event: MouseEvent): void {
    this.handleGroupClick(event, '#sidebar-footer-nav', this.footerPillGroup);
  }

  onNavScroll(): void {
    if (this.hoverTarget !== null || this.focusTarget !== null) {
      this.hideTooltip();
    }
  }

  onHostMouseOver(event: MouseEvent): void {
    if (!this.isRailMode()) {
      return;
    }
    const item = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-tooltip-key]');
    if (!item || item === this.hoverTarget) {
      return;
    }
    this.hoverTarget = item;
    this.showTooltipFor(item);
  }

  onHostMouseOut(event: MouseEvent): void {
    if (this.hoverTarget === null) {
      return;
    }
    const related = event.relatedTarget as Node | null;
    if (related !== null && this.hoverTarget.contains(related)) {
      return;
    }
    this.hoverTarget = null;
    if (this.focusTarget !== null && this.isRailMode()) {
      this.showTooltipFor(this.focusTarget);
    } else {
      this.railTooltip.set(null);
    }
  }

  onHostFocusIn(event: FocusEvent): void {
    if (!this.isRailMode()) {
      return;
    }
    const item = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-tooltip-key]');
    if (!item || !this.isFocusVisible(item)) {
      return;
    }
    this.focusTarget = item;
    this.showTooltipFor(item);
  }

  onHostFocusOut(event: FocusEvent): void {
    if (this.focusTarget === null) {
      return;
    }
    const related = event.relatedTarget as Node | null;
    if (related !== null && this.focusTarget.contains(related)) {
      return;
    }
    this.focusTarget = null;
    if (this.hoverTarget !== null && this.isRailMode()) {
      this.showTooltipFor(this.hoverTarget);
    } else {
      this.railTooltip.set(null);
    }
  }

  hideTooltip(): void {
    this.hoverTarget = null;
    this.focusTarget = null;
    this.railTooltip.set(null);
  }

  protected tooltipFor(key: string): string | null {
    return this.isRailMode() && this.railTooltip()?.key === key ? 'sidebar-rail-tooltip' : null;
  }

  onHostTransitionEnd(event: TransitionEvent): void {
    if (
      event.target === this.elementRef.nativeElement &&
      (event.propertyName === 'width' || event.propertyName === 'transform')
    ) {
      this.syncPillPosition(true);
    }
  }

  private handleGroupClick(
    event: MouseEvent,
    containerSelector: string,
    group: PillGroupState,
  ): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('.item');
    if (target && !target.classList.contains('is-branch')) {
      const container = (this.elementRef.nativeElement as HTMLElement).querySelector<HTMLElement>(
        containerSelector,
      );
      if (container !== null) {
        this.animatePillToElement(group, container, target);
      }
    }
    if (this.isMobile() && this.mobileOpen()) {
      this.sidebarState.closeMobile();
    }
  }

  private isRailMode(): boolean {
    return this.collapsed() && !this.isMobile();
  }

  private isFocusVisible(element: HTMLElement): boolean {
    try {
      return element.matches(':focus-visible');
    } catch {
      return true;
    }
  }

  private showTooltipFor(item: HTMLElement): void {
    const key = item.getAttribute('data-tooltip-key') ?? '';
    const text =
      item.getAttribute('aria-label')?.trim() ||
      item.getAttribute('title')?.trim() ||
      item.querySelector('.item-label')?.textContent?.trim() ||
      '';
    if (!key || !text) {
      return;
    }

    const hostEl = this.elementRef.nativeElement as HTMLElement;
    const hostRect = hostEl.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const railWidth = hostRect.width > 0 ? hostRect.width : 76;

    this.railTooltip.set({
      key,
      text,
      top: itemRect.top - hostRect.top + itemRect.height / 2,
      left: railWidth + 10,
    });
  }

  private clearTimers(): void {
    this.clearPillTimer(this.navPillGroup);
    this.clearPillTimer(this.footerPillGroup);
    if (this.scheduleTimer !== null) {
      clearTimeout(this.scheduleTimer);
      this.scheduleTimer = null;
    }
    if (this.focusTimer !== null) {
      clearTimeout(this.focusTimer);
      this.focusTimer = null;
    }
  }

  private clearPillTimer(group: PillGroupState): void {
    if (group.timer !== null) {
      clearTimeout(group.timer);
      group.timer = null;
    }
  }

  private setupResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const hostEl = this.elementRef.nativeElement as HTMLElement;
    const navEl = hostEl.querySelector<HTMLElement>('#sidebar-nav');
    const footerEl = hostEl.querySelector<HTMLElement>('#sidebar-footer-nav');
    if (!navEl && !footerEl) {
      return;
    }
    const observer = new ResizeObserver(() => {
      this.syncPillPosition(true);
    });
    if (navEl) {
      observer.observe(navEl);
    }
    if (footerEl) {
      observer.observe(footerEl);
    }
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  private schedulePillUpdate(immediate: boolean): void {
    if (typeof window === 'undefined') {
      return;
    }
    if (this.scheduleTimer !== null) {
      clearTimeout(this.scheduleTimer);
      this.scheduleTimer = null;
    }
    // Allow Angular's RouterLinkActive and `@if` blocks to update DOM geometry first.
    this.scheduleTimer = setTimeout(() => {
      this.scheduleTimer = null;
      this.syncPillPosition(immediate);
    }, 20);
  }

  private animatePillToElement(
    group: PillGroupState,
    containerEl: HTMLElement,
    itemEl: HTMLElement,
  ): void {
    const containerRect = containerEl.getBoundingClientRect();
    const itemRect = itemEl.getBoundingClientRect();

    const targetTop = itemRect.top - containerRect.top + containerEl.scrollTop;
    const targetLeft = itemRect.left - containerRect.left + containerEl.scrollLeft;
    const targetWidth = itemRect.width;
    const targetHeight = itemRect.height;

    const prevTop = group.top();
    const prevHeight = group.height();

    if (!group.visible() || !group.hasAnimatedOnce) {
      group.top.set(targetTop);
      group.left.set(targetLeft);
      group.width.set(targetWidth);
      group.height.set(targetHeight);
      group.visible.set(true);
      group.hasAnimatedOnce = true;
      return;
    }

    if (
      Math.abs(prevTop - targetTop) < 1 &&
      Math.abs(prevHeight - targetHeight) < 1 &&
      Math.abs(group.left() - targetLeft) < 1 &&
      Math.abs(group.width() - targetWidth) < 1
    ) {
      return;
    }

    this.clearPillTimer(group);

    const minTop = Math.min(prevTop, targetTop);
    const maxBottom = Math.max(prevTop + prevHeight, targetTop + targetHeight);
    const bridgeHeight = maxBottom - minTop;

    // Step 1: Stretch connecting both items
    group.top.set(minTop);
    group.height.set(bridgeHeight);
    group.left.set(targetLeft);
    group.width.set(targetWidth);

    // Step 2: Contract to destination item
    group.timer = setTimeout(() => {
      group.top.set(targetTop);
      group.height.set(targetHeight);
      group.timer = null;
    }, 130);
  }

  private syncPillPosition(immediate: boolean): void {
    this.syncPillGroup(this.navPillGroup, '#sidebar-nav', immediate);
    this.syncPillGroup(this.footerPillGroup, '#sidebar-footer-nav', immediate);
  }

  private syncPillGroup(
    group: PillGroupState,
    containerSelector: string,
    immediate: boolean,
  ): void {
    const hostEl = this.elementRef.nativeElement as HTMLElement;
    const containerEl = hostEl.querySelector<HTMLElement>(containerSelector);
    if (!containerEl) {
      return;
    }

    const activeItem = containerEl.querySelector<HTMLElement>('.item.is-active');
    if (!activeItem) {
      this.clearPillTimer(group);
      group.visible.set(false);
      return;
    }

    if (immediate) {
      this.clearPillTimer(group);
      const containerRect = containerEl.getBoundingClientRect();
      const itemRect = activeItem.getBoundingClientRect();

      group.top.set(itemRect.top - containerRect.top + containerEl.scrollTop);
      group.left.set(itemRect.left - containerRect.left + containerEl.scrollLeft);
      group.width.set(itemRect.width);
      group.height.set(itemRect.height);
      group.visible.set(true);
      group.hasAnimatedOnce = true;
      return;
    }

    this.animatePillToElement(group, containerEl, activeItem);
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
    this.sidebarState.closeMobile();
    this.auth
      .cerrarSesion()
      .pipe(finalize(() => void this.router.navigate(['/login'])))
      // A rejected logout needs no message here: the exit already happened.
      .subscribe({ error: () => undefined });
  }
}
