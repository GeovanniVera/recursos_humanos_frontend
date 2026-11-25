import { Component, input, output, signal } from '@angular/core';
import { Button } from '../../../shared/ui/button/button.component';
import { Modal } from '../../../shared/ui/modal/modal.component';

/**
 * Credential card of the drawer: who is signed in, what role they hold, and the
 * way out.
 *
 * It was split out of `Sidebar` for two reasons. The drawer's stylesheet sat at
 * 6.8 kB against a 7 kB component budget, and this is a different surface: a
 * card pinned to the foot of the sheet, not another navigation entry.
 *
 * The card is presentational. The drawer reads the session and hands it down as
 * inputs, and the sign-out is emitted only after the person confirms — so
 * `AuthService` stays out of here and the drawer keeps a single exit path.
 */
@Component({
  selector: 'app-sidebar-credential-card',
  imports: [Button, Modal],
  templateUrl: './credential-card.component.html',
  styleUrl: './credential-card.component.scss',
})
export class SidebarCredentialCard {
  /** Display name of the session, or the neutral placeholder. */
  readonly name = input('Nombre Apellido');

  /** Two initials for the avatar. */
  readonly initials = input('NA');

  /** Readable role label. The raw code never reaches this card. */
  readonly role = input('Administrador');

  /** `true` on the 76px rail: the avatar and an icon-only exit survive. */
  readonly collapsed = input(false);

  /**
   * `aria-describedby` of the rail tooltip. It belongs to the drawer, which is
   * the only component that knows where the rail floats.
   */
  readonly tooltipId = input<string | null>(null);

  /** Emitted after the confirmation is accepted; never on the first click. */
  readonly signOut = output<void>();

  /** Opens the confirmation layer. */
  protected readonly confirming = signal(false);

  /** The only path to `signOut`: the layer was accepted, not merely opened. */
  protected confirmSignOut(): void {
    this.confirming.set(false);
    this.signOut.emit();
  }
}
