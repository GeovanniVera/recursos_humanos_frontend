import { Component, computed, input } from '@angular/core';

/** Visual weight of the button. One primary per view or layer, never two. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/** `md` is the default 44px target; `sm` is the compact toolbar size. */
export type ButtonSize = 'md' | 'sm';

/**
 * The single button of the design system.
 *
 * It is a real `<button>` — never a styled `<div>` — so keyboard activation,
 * form submission and the accessibility tree come from the platform. The label
 * is projected, which keeps the component free of copy and lets the caller use
 * an icon, a text node or both.
 *
 * A bare `<button>` inside a component would paint the user-agent face over the
 * glass; that is why the surface comes from a token and the border is always
 * present, transparent when the variant has no line.
 */
@Component({
  selector: 'app-button',
  templateUrl: './button.component.html',
  styleUrl: './button.component.scss',
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly type = input<'button' | 'submit'>('button');
  readonly disabled = input(false);
  readonly loading = input(false);

  /**
   * A loading button cannot be pressed twice: it is disabled and announces
   * `aria-busy`. The label stays on screen — swapping it for a spinner loses
   * the meaning of the action exactly when the user needs it most.
   */
  readonly isDisabled = computed(() => this.disabled() || this.loading());

  readonly buttonClass = computed(() => {
    const classes = ['button', `is-${this.variant()}`, `is-${this.size()}`];
    if (this.loading()) {
      classes.push('is-loading');
    }
    return classes.join(' ');
  });
}
