import { Service, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import type { Folder, Mailbox } from '../shared/models';
import { FolderService } from './api/folder.service';
import { MeService } from './api/me.service';
import { RealtimeService } from './realtime.service';

// The shell draws the folder list and the inbox reads messages from it, so the selected
// mailbox and folder cannot live inside either one.
@Service()
export class MailboxContext {
  private readonly me = inject(MeService);
  private readonly foldersApi = inject(FolderService);
  private readonly realtime = inject(RealtimeService);

  constructor() {
    // Mail arriving is the one thing that changes a badge without the panel doing anything,
    // so it is the one thing that has to refetch them. Everything else - reading, moving,
    // deleting - already reloads on its way out.
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

    // The platform address first: it is the one a consumer actually reads.
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
      // A mailbox whose domain is not verified yet has no IMAP account to list.
      error: () => this.folders.set([]),
    });
  }
}
