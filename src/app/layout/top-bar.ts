import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { AuthService } from '../core/auth/auth.service';
import { ThemeService } from '../core/theme.service';

@Component({
  selector: 'stampyx-top-bar',
  imports: [TranslocoDirective, RouterLink],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.css',
})
export class TopBar {
  protected readonly theme = inject(ThemeService);
  protected readonly auth = inject(AuthService);
}
