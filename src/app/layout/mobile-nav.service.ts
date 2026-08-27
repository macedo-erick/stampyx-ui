import { Service, signal } from '@angular/core';

/**
 * The drawer's open state. The top bar's hamburger opens it, the sidebar's own rows and the
 * scrim close it, and they are siblings under the shell rather than parent and child, so the
 * flag lives here instead of being threaded through both.
 *
 * Only meaningful under the layout's mobile breakpoint: above it the sidebar is a static
 * column and the drawer chrome is display:none, so the flag is simply never read.
 */
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
