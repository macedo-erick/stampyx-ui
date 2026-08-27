import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { AuthService } from '../../core/auth/auth.service';
import { MailboxSessionService } from '../../core/auth/mailbox-session.service';
import { ThemeService } from '../../core/theme.service';

@Component({
  selector: 'stampyx-login-page',
  imports: [TranslocoDirective, FormsModule],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPage {
  protected readonly theme = inject(ThemeService);
  private readonly session = inject(MailboxSessionService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly step = signal<1 | 2>(1);
  private readonly focusTarget = viewChild<ElementRef<HTMLInputElement>>('focusTarget');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly revealed = signal(false);
  protected readonly busy = signal(false);
  protected readonly failed = signal<string | null>(null);

  protected readonly canContinue = computed(() => {
    const at = this.email().trim().lastIndexOf('@');

    return at > 0 && at < this.email().trim().length - 1;
  });

  constructor() {
    effect(() => {
      this.step();
      this.focusTarget()?.nativeElement.focus();
    });
  }

  protected next(): void {
    if (this.canContinue()) {
      this.failed.set(null);
      this.step.set(2);
    }
  }

  protected back(): void {
    this.step.set(1);
    this.password.set('');
    this.revealed.set(false);
    this.failed.set(null);
  }

  protected submit(): void {
    if (this.busy() || this.password() === '') {
      return;
    }

    this.busy.set(true);
    this.failed.set(null);

    this.session.login(this.email().trim(), this.password()).subscribe({
      next: () => {
        this.busy.set(false);
        void this.router.navigateByUrl(this.redirectTarget());
      },
      error: () => {
        this.busy.set(false);
        this.failed.set('login.failed');
      },
    });
  }

  protected signInWithKeycloak(): void {
    this.auth.login(this.redirectTarget());
  }

  private redirectTarget(): string {
    const redirect = new URLSearchParams(window.location.search).get('redirect');

    return redirect !== null && redirect.startsWith('/') ? redirect : '/inbox';
  }
}
