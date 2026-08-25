import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';

import { DomainService } from '../../core/api/domain.service';
import type { Domain } from '../../shared/models';
import { EmptyState } from '../../shared/ui/empty-state';
import { PageHeader } from '../../shared/ui/page-header';

@Component({
  selector: 'stampyx-domains-page',
  imports: [TranslocoDirective, RouterLink, PageHeader, EmptyState],
  templateUrl: './domains-page.html',
  host: { class: 'flex flex-1 flex-col overflow-hidden' },
})
export class DomainsPage {
  private readonly domains = inject(DomainService);
  private readonly toast = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly items = signal<Domain[]>([]);
  protected readonly loading = signal(true);
  protected readonly dialogOpen = signal(false);
  protected readonly newName = signal('');
  protected readonly saving = signal(false);

  constructor() {
    this.refresh();
  }

  protected refresh(): void {
    this.loading.set(true);
    this.domains.list().subscribe({
      next: (rows) => {
        this.items.set(rows);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected open(): void {
    this.newName.set('');
    this.dialogOpen.set(true);
  }

  protected save(): void {
    const name = this.newName().trim();

    if (name === '') {
      return;
    }

    this.saving.set(true);
    this.domains.create(name).subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogOpen.set(false);
        this.refresh();
      },
      error: () => this.saving.set(false),
    });
  }

  protected verify(domain: Domain): void {
    this.domains.verify(domain.id).subscribe({
      next: () => {
        this.toast.add({
          severity: 'success',
          summary: this.transloco.translate('domains.verifySucceeded'),
        });
        this.refresh();
      },
      error: () => {
        this.toast.add({
          severity: 'warn',
          summary: this.transloco.translate('domains.verifyFailed'),
        });
      },
    });
  }
}
