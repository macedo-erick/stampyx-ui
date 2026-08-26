import { Service, computed, inject, signal } from '@angular/core';

import type { Folder, Mailbox } from '../shared/models';
import { FolderService } from './api/folder.service';
import { MeService } from './api/me.service';

// The shell draws the folder list and the inbox reads messages from it, so the selected
// mailbox and folder cannot live inside either one.
@Service()
export class MailboxContext {
  private readonly me = inject(MeService);
  private readonly foldersApi = inject(FolderService);

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
  readonly folder = signal('INBOX');

  readonly currentFolder = computed(
    () => this.folders().find((row) => row.path === this.folder()) ?? null,
  );

  // Read off SPECIAL-USE rather than the path, for the same reason archivePath is: a server
  // is free to call these folders whatever it likes.
  readonly outgoing = computed(() => {
    const use = this.currentFolder()?.specialUse;

    return use === '\\Sent' || use === '\\Drafts';
  });

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
