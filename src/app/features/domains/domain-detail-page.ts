import { Component, inject, input, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';

import { DomainService } from '../../core/api/domain.service';
import type { CheckStatus, DnsCheckReport, DnsRecord, Domain, Mailbox } from '../../shared/models';
import { PageHeader } from '../../shared/ui/page-header';

@Component({
  selector: 'stampyx-domain-detail-page',
  imports: [TranslocoDirective, PageHeader],
  templateUrl: './domain-detail-page.html',
  host: { class: 'flex flex-1 flex-col overflow-hidden' },
})
export class DomainDetailPage {
  readonly id = input.required<string>();

  private readonly domains = inject(DomainService);
  private readonly toast = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly domain = signal<Domain | null>(null);
  protected readonly report = signal<DnsCheckReport | null>(null);
  protected readonly mailboxes = signal<Mailbox[]>([]);
  protected readonly copied = signal<string | null>(null);

  protected readonly dialogOpen = signal(false);
  protected readonly localPart = signal('');
  protected readonly password = signal('');
  protected readonly saving = signal(false);

  constructor() {
    queueMicrotask(() => {
      this.load();
    });
  }

  protected load(): void {
    const id = this.id();

    this.domains.get(id).subscribe((row) => this.domain.set(row));
    this.domains.mailboxes(id).subscribe((rows) => this.mailboxes.set(rows));
    this.recheck();
  }

  protected recheck(): void {
    this.domains.check(this.id()).subscribe((report) => this.report.set(report));
  }

  protected verify(): void {
    this.domains.verify(this.id()).subscribe({
      next: () => {
        this.toast.add({
          severity: 'success',
          summary: this.transloco.translate('domains.verifySucceeded'),
        });
        this.load();
      },
      error: () =>
        this.toast.add({
          severity: 'warn',
          summary: this.transloco.translate('domains.verifyFailed'),
        }),
    });
  }

  protected async copy(value: string): Promise<void> {
    await navigator.clipboard.writeText(value);
    this.copied.set(value);
    setTimeout(() => this.copied.set(null), 1500);
  }

  protected statusOf(record: DnsRecord): CheckStatus | null {
    const checks = this.report()?.checks ?? [];
    const name = checkNameFor(record);

    return checks.find((check) => check.name === name)?.status ?? null;
  }

  protected get ptr(): CheckStatus | null {
    return this.report()?.checks.find((check) => check.name === 'PTR')?.status ?? null;
  }

  protected openMailbox(): void {
    this.localPart.set('');
    this.password.set('');
    this.dialogOpen.set(true);
  }

  protected saveMailbox(): void {
    this.saving.set(true);

    this.domains
      .createMailbox(this.id(), { localPart: this.localPart(), password: this.password() })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.dialogOpen.set(false);
          this.load();
        },
        error: () => this.saving.set(false),
      });
  }
}

function checkNameFor(record: DnsRecord): string {
  if (record.type === 'MX') {
    return 'MX';
  }

  if (record.host.startsWith('_dmarc')) {
    return 'DMARC';
  }

  if (record.host.includes('_domainkey')) {
    return 'DKIM';
  }

  return record.value.startsWith('v=spf1') ? 'SPF' : 'CHALLENGE';
}
