import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OtpInput } from './otp-input.component';

/** Types one character into a box, the way a browser does. */
function type(box: HTMLInputElement, value: string): void {
  box.value = value;
  box.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Reads the six boxes in template order. */
function boxes(fixture: ComponentFixture<OtpInput>): HTMLInputElement[] {
  const host = fixture.nativeElement as HTMLElement;
  return Array.from(host.querySelectorAll<HTMLInputElement>('input.box'));
}

describe('OtpInput', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OtpInput],
    }).compileComponents();
  });

  it('renders six digit boxes', async () => {
    const fixture = TestBed.createComponent(OtpInput);
    await fixture.whenStable();

    const rendered = boxes(fixture);

    expect(rendered).toHaveLength(6);
    expect(rendered[0].getAttribute('inputmode')).toBe('numeric');
    expect(rendered[0].getAttribute('autocomplete')).toBe('one-time-code');
  });

  it('advances the focus when a digit is typed', async () => {
    const fixture = TestBed.createComponent(OtpInput);
    await fixture.whenStable();
    const rendered = boxes(fixture);

    rendered[0].focus();
    type(rendered[0], '4');
    await fixture.whenStable();

    expect(rendered[0].value).toBe('4');
    expect(document.activeElement).toBe(rendered[1]);
  });

  it('fills the six boxes when a complete code is pasted', async () => {
    const fixture = TestBed.createComponent(OtpInput);
    await fixture.whenStable();
    const rendered = boxes(fixture);

    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', {
      value: { getData: () => '123456' },
    });
    rendered[2].dispatchEvent(paste);
    await fixture.whenStable();

    expect(rendered.map((box) => box.value)).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('drops everything that is not a digit', async () => {
    const fixture = TestBed.createComponent(OtpInput);
    await fixture.whenStable();
    const rendered = boxes(fixture);

    type(rendered[0], 'a');
    await fixture.whenStable();

    expect(rendered[0].value).toBe('');
    expect(document.activeElement).not.toBe(rendered[1]);
  });

  it('goes back and clears the previous box on backspace', async () => {
    const fixture = TestBed.createComponent(OtpInput);
    await fixture.whenStable();
    const rendered = boxes(fixture);

    type(rendered[0], '7');
    type(rendered[1], '8');
    await fixture.whenStable();

    rendered[2].focus();
    rendered[2].dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();

    expect(rendered[1].value).toBe('');
    expect(document.activeElement).toBe(rendered[1]);
  });

  it('emits the joined value and reflects the error state on the boxes', async () => {
    const fixture = TestBed.createComponent(OtpInput);
    fixture.componentRef.setInput('isInvalid', true);
    await fixture.whenStable();

    const emitted: string[] = [];
    fixture.componentInstance.valueChanges.subscribe((value) => emitted.push(value));

    const rendered = boxes(fixture);
    type(rendered[0], '9');
    await fixture.whenStable();

    expect(emitted.at(-1)).toBe('9');
    expect(rendered[0].getAttribute('aria-invalid')).toBe('true');
  });
});
