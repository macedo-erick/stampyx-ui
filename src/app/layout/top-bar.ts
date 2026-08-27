import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { AuthService } from '../core/auth/auth.service';
import { ThemeService } from '../core/theme.service';
import { MobileNav } from './mobile-nav.service';

@Component({
  selector: 'stampyx-top-bar',
  imports: [TranslocoDirective, RouterLink],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.css',
  // The brand sits before the field in the DOM, so the open field cannot reach it with a
  // sibling selector; the state goes on the host and the CSS reads it from there.
  host: { '[class.is-searching]': 'searchOpen()' },
})
export class TopBar {
  protected readonly theme = inject(ThemeService);
  protected readonly auth = inject(AuthService);
  protected readonly nav = inject(MobileNav);

  // Presentational only, and only under the breakpoint: the field is always laid out above it.
  protected readonly searchOpen = signal(false);
}
