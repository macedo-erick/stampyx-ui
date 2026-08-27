import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { environment } from '../../../environments/environment';
import { MeService } from '../../core/api/me.service';
import { AuthService } from '../../core/auth/auth.service';
import { MailboxSessionService } from '../../core/auth/mailbox-session.service';
import { LocaleService } from '../../core/i18n/locale.service';
import { ThemeService } from '../../core/theme.service';
import { PageHeader } from '../../shared/ui/page-header';
import { APP_LOCALES, type AppLocale, currentLocale } from '../../shared/util/locale';

@Component({
  selector: 'stampyx-settings-page',
  imports: [TranslocoDirective, PageHeader],
  templateUrl: './settings-page.html',
  host: { class: 'flex flex-1 flex-col overflow-hidden' },
})
export class SettingsPage {
  protected readonly theme = inject(ThemeService);
  protected readonly auth = inject(AuthService);
  private readonly locales = inject(LocaleService);
  private readonly me = inject(MeService);
  private readonly session = inject(MailboxSessionService);
  private readonly http = inject(HttpClient);

  protected readonly localeOptions = APP_LOCALES.map((value) => ({
    label: value === 'pt-BR' ? 'Português' : 'English',
    value,
  }));

  protected readonly current = currentLocale;

  protected readonly isMailboxSession = computed(() => this.me.kind() === 'mailbox');

  // A mailbox user has one password; an account holder is setting the mail password an external client needs.
  protected readonly targetMailbox = computed(
    () => this.me.mailboxes().find((row) => this.isMailboxSession() || row.platform) ?? null,
  );

  protected readonly currentPassword = signal('');
  protected readonly newPassword = signal('');
  // One eye per field, so checking the new password does not put the old one on screen too.
  protected readonly revealCurrent = signal(false);
  protected readonly revealNew = signal(false);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly feedback = signal<string | null>(null);

  protected setLocale(locale: AppLocale): void {
    this.locales.set(locale);
  }

  protected savePassword(mailboxId: string): void {
    if (this.saving() || this.newPassword().length < 12) {
      return;
    }

    this.saving.set(true);
    this.feedback.set(null);

    const request = this.isMailboxSession()
      ? this.session.changePassword(this.currentPassword(), this.newPassword())
      : this.http.put<void>(`${environment.apiUrl}/mailboxes/${mailboxId}/password`, {
          password: this.newPassword(),
        });

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
        this.feedback.set('settings.passwordSaved');
        this.currentPassword.set('');
        this.newPassword.set('');
        this.revealCurrent.set(false);
        this.revealNew.set(false);
      },
      error: () => {
        this.saving.set(false);
        this.saved.set(false);
        this.feedback.set('settings.passwordFailed');
      },
    });
  }
}
