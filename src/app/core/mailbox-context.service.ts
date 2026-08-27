import { Service, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import type { Folder, Mailbox } from '../shared/models';
import { FolderService } from './api/folder.service';
import { MeService } from './api/me.service';
import { RealtimeService } from './realtime.service';

@Service()
export class MailboxContext {
  private readonly me = inject(MeService);
  private readonly foldersApi = inject(FolderService);
  private readonly realtime = inject(RealtimeService);

  constructor() {
    this.realtime.received$.pipe(takeUntilDestroyed()).subscribe(() => this.reloadFolders());
  }

  private readonly chosen = signal<string | null>(null);

  readonly mailboxes = computed<readonly Mailbox[]>(() => this.me.mailboxes());

  readonly currentId = computed(() => {
    const picked = this.chosen();
    const available = this.mailboxes();

    if (picked !== null && available.some((row) => row.id === picked)) {
      return picked;
    }

    return (available.find((row) => row.platform) ?? available[0])?.id ?? null;
  });

  readonly current = computed(
    () => this.mailboxes().find((row) => row.id === this.currentId()) ?? null,
  );

  readonly folders = signal<Folder[]>([]);

  readonly archivePath = computed(
    () => this.folders().find((row) => row.specialUse === '\\Archive')?.path ?? null,
  );

  readonly draftsPath = computed(
    () => this.folders().find((row) => row.specialUse === '\\Drafts')?.path ?? null,
  );

  readonly trashPath = computed(
    () => this.folders().find((row) => row.specialUse === '\\Trash')?.path ?? null,
  );

  readonly sentPath = computed(
    () => this.folders().find((row) => row.specialUse === '\\Sent')?.path ?? null,
  );
  readonly folder = signal('INBOX');

  select(mailboxId: string): void {
    this.chosen.set(mailboxId);
    this.folder.set('INBOX');
    this.reloadFolders();
  }

  selectFolder(path: string): void {
    this.folder.set(path);
  }

  reloadFolders(): void {
    const id = this.currentId();

    if (id === null) {
      this.folders.set([]);

      return;
    }

    this.foldersApi.list(id).subscribe({
      next: (rows) => this.folders.set(rows),
      error: () => this.folders.set([]),
    });
  }
}
