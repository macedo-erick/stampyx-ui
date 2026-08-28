import { Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService as ToastService } from 'primeng/api';

import { FolderService } from '../../core/api/folder.service';
import { MailboxContext } from '../../core/mailbox-context.service';
import type { Folder } from '../../shared/models';
import { PageHeader } from '../../shared/ui/page-header';

@Component({
  selector: 'stampyx-folders-page',
  imports: [TranslocoDirective, PageHeader],
  templateUrl: './folders-page.html',
  host: { class: 'flex flex-1 flex-col overflow-hidden' },
})
export class FoldersPage {
  protected readonly context = inject(MailboxContext);
  private readonly api = inject(FolderService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmationService);
  private readonly transloco = inject(TranslocoService);

  protected readonly name = signal('');
  protected readonly parent = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly renaming = signal<string | null>(null);
  protected readonly renameValue = signal('');

  protected readonly systemFolders = computed(() =>
    this.context.folders().filter((row) => row.system),
  );

  protected readonly ownFolders = computed(() =>
    this.context.folders().filter((row) => !row.system),
  );

  protected readonly parentOptions = computed(() =>
    this.ownFolders().filter((row) => row.parent === null),
  );

  protected create(): void {
    const mailboxId = this.context.currentId();
    const name = this.name().trim();

    if (mailboxId === null || name === '' || this.saving()) {
      return;
    }

    this.saving.set(true);

    this.api.create(mailboxId, name, this.parent() ?? undefined).subscribe({
      next: (created) => {
        this.saving.set(false);
        this.name.set('');
        this.parent.set(null);
        this.context.reloadFolders();
        this.toast.add({ severity: 'success', summary: created.path });
      },
      error: () => this.saving.set(false),
    });
  }

  protected startRename(folder: Folder): void {
    this.renaming.set(folder.path);
    this.renameValue.set(folder.name);
  }

  protected confirmRename(folder: Folder): void {
    const mailboxId = this.context.currentId();
    const name = this.renameValue().trim();

    if (mailboxId === null || name === '' || name === folder.name) {
      this.renaming.set(null);

      return;
    }

    this.api.rename(mailboxId, folder.path, name).subscribe({
      next: () => {
        this.renaming.set(null);
        this.context.reloadFolders();
      },
      error: () => this.renaming.set(null),
    });
  }

  protected remove(folder: Folder): void {
    const mailboxId = this.context.currentId();

    if (mailboxId === null) {
      return;
    }

    this.confirm.confirm({
      header: this.transloco.translate('folders.confirmDeleteTitle'),
      message: this.transloco.translate('folders.confirmDelete', {
        name: folder.path,
        count: folder.total,
      }),
      acceptLabel: this.transloco.translate('common.delete'),
      rejectLabel: this.transloco.translate('common.cancel'),
      acceptButtonStyleClass: 'stx-pill--danger',
      accept: () => {
        this.api.remove(mailboxId, folder.path).subscribe({
          next: () => this.context.reloadFolders(),
          error: () => undefined,
        });
      },
    });
  }
}
