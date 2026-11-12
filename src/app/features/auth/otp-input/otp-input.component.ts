import {
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChildren,
} from '@angular/core';

/** Number of digits in the one-time code. */
const CODE_LENGTH = 6;

/**
 * Groups of ids, so several instances on one page stay distinguishable without
 * generating anything at random.
 */
let instances = 0;

/**
 * Six single-character boxes that together form the one-time code.
 *
 * The component owns the digits and emits the joined string; there is no
 * reactive form behind it yet. Keyboard support: digits auto-advance,
 * backspace goes back and clears, the arrow keys move, and pasting a code fills
 * every box. Anything that is not a digit is dropped silently.
 */
@Component({
  selector: 'app-otp-input',
  templateUrl: './otp-input.component.html',
  styleUrl: './otp-input.component.scss',
})
export class OtpInput {
  /** Turns the boxes into the error look: red border plus a short shake. */
  readonly isInvalid = input(false);

  /** Disables every box while the code is being verified. */
  readonly disabled = input(false);

  /** Emits the joined digits whenever they change. */
  readonly valueChanges = output<string>();

  /** Box indexes, used by the template loop. */
  readonly indices = Array.from({ length: CODE_LENGTH }, (_, index) => index);

  /** One digit per box; an empty string means the box is empty. */
  private readonly digits = signal<string[]>(Array.from({ length: CODE_LENGTH }, () => ''));

  private readonly boxes = viewChildren<ElementRef<HTMLInputElement>>('box');

  /** Id shared by the group label and the `aria-labelledby` of the group. */
  readonly labelId = `otp-label-${instances++}`;

  /** Current code, as the caller sees it. */
  readonly value = computed(() => this.digits().join(''));

  /** Id of one box, so the group label can point at the first one. */
  boxId(index: number): string {
    return `${this.labelId}-${index}`;
  }

  /** Digit currently held by a box. */
  digitAt(index: number): string {
    return this.digits()[index] ?? '';
  }

  /** Focuses the first box. */
  focusFirst(): void {
    this.focus(0);
  }

  /** Handles a typed character: keeps the first digit and advances. */
  onInput(index: number, event: Event): void {
    const target = event.target as HTMLInputElement;
    const typed = target.value.replace(/\D/g, '');

    if (typed.length === 0) {
      // The browser already painted the rejected character, so wipe it too:
      // the signal does not change and would not repaint the box.
      target.value = '';
      this.write(index, '');
      return;
    }

    // More than one digit lands here when the browser autofills the whole code.
    const filled = this.spread(index, typed);

    if (filled < CODE_LENGTH - 1) {
      this.focus(filled + 1);
    }
  }

  /** Handles backspace, arrows and the other navigation keys. */
  onKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && this.digitAt(index) === '') {
      event.preventDefault();
      if (index > 0) {
        this.write(index - 1, '');
        this.focus(index - 1);
      }
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.focus(Math.max(index - 1, 0));
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.focus(Math.min(index + 1, CODE_LENGTH - 1));
    }
  }

  /** Fills the boxes from a pasted string, ignoring everything but digits. */
  onPaste(index: number, event: ClipboardEvent): void {
    event.preventDefault();
    const text = event.clipboardData?.getData('text') ?? '';
    const pasted = text.replace(/\D/g, '');

    if (pasted.length === 0) {
      return;
    }

    // A full code always fills the row from the start, wherever it landed.
    const start = pasted.length >= CODE_LENGTH ? 0 : index;
    const filled = this.spread(start, pasted);
    this.focus(Math.min(filled + 1, CODE_LENGTH - 1));
  }

  /** Writes `text` from `start` and returns the index of the last box written. */
  private spread(start: number, text: string): number {
    const next = [...this.digits()];
    let last = start;

    for (let offset = 0; offset < text.length; offset += 1) {
      const position = start + offset;
      if (position >= CODE_LENGTH) {
        break;
      }
      next[position] = text[offset] ?? '';
      last = position;
    }

    this.digits.set(next);
    this.emit();
    return last;
  }

  private write(index: number, digit: string): void {
    const next = [...this.digits()];
    next[index] = digit;
    this.digits.set(next);
    this.emit();
  }

  private emit(): void {
    this.valueChanges.emit(this.value());
  }

  private focus(index: number): void {
    this.boxes()[index]?.nativeElement.focus();
  }
}
