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
  host: { '[class.is-searching]': 'searchOpen()' },
})
export class TopBar {
  protected readonly theme = inject(ThemeService);
  protected readonly auth = inject(AuthService);
  protected readonly nav = inject(MobileNav);

  protected readonly searchOpen = signal(false);
}
