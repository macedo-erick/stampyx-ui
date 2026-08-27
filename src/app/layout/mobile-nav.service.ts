import { Service, signal } from '@angular/core';

// The drawer's open state. The top bar opens it and the sidebar closes it, and the two are
// siblings under the shell, so the flag lives here rather than being threaded through both.
@Service()
export class MobileNav {
  readonly open = signal(false);

  toggle(): void {
    this.open.update((value) => !value);
  }

  close(): void {
    this.open.set(false);
  }
}
