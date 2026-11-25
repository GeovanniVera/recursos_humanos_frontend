// jsdom does not implement the modal methods of <dialog>. The application uses
// native dialogs on purpose — the top layer, the focus trap and Escape come from
// the platform — so the test environment only needs the same contract instead of
// a second implementation of the drawer.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.show = function (this: HTMLDialogElement): void {
    this.setAttribute('open', '');
  };

  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement): void {
    this.setAttribute('open', '');
  };

  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement): void {
    if (!this.hasAttribute('open')) {
      return;
    }

    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}
