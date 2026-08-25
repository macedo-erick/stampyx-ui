import { Component, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';

import { type AccountStatus, AdminService } from '../../core/api/admin.service';
import type { AdminAccount, AdminMailbox } from '../../shared/models';
import { PageHeader } from '../../shared/ui/page-header';

@Component({
  selector: 'stampyx-admin-page',
  imports: [TranslocoDirective, PageHeader],
  templateUrl: './admin-page.html',
  host: { class: 'flex flex-1 flex-col overflow-hidden' },
})
export class AdminPage {
  private readonly admin = inject(AdminService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly accounts = signal<AdminAccount[]>([]);
  protected readonly mailboxes = signal<AdminMailbox[]>([]);
  protected readonly busy = signal(false);

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.admin.accounts().subscribe((rows) => this.accounts.set(rows));
    this.admin.mailboxes().subscribe((rows) => this.mailboxes.set(rows));
  }

  protected setStatus(account: AdminAccount, status: AccountStatus): void {
    this.busy.set(true);

    this.admin.setStatus(account.id, status).subscribe({
      next: () => {
        this.busy.set(false);
        this.reload();
      },
      error: () => this.busy.set(false),
    });
  }

  protected removeAccount(account: AdminAccount): void {
    this.confirm.confirm({
      // Deleting a tenant takes their domains, mailboxes and stored mail with it.
      message: `${account.email} — ${String(account.mailboxCount)} mailbox(es)`,
      accept: () => {
        this.admin.removeAccount(account.id).subscribe({
          next: () => this.reload(),
          error: () => undefined,
        });
      },
    });
  }

  protected resetPassword(mailbox: AdminMailbox): void {
    const password = window.prompt(mailbox.address);

    if (password === null || password.length < 12) {
      return;
    }

    this.admin.resetPassword(mailbox.id, password).subscribe({
      next: () => this.toast.add({ severity: 'success', summary: mailbox.address }),
      error: () => undefined,
    });
  }

  protected removeMailbox(mailbox: AdminMailbox): void {
    this.confirm.confirm({
      message: mailbox.address,
      accept: () => {
        this.admin.removeMailbox(mailbox.id).subscribe({
          next: () => this.reload(),
          error: () => undefined,
        });
      },
    });
  }
}
