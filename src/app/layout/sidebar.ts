import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { MeService } from '../core/api/me.service';
import { AuthService } from '../core/auth/auth.service';
import { MailboxContext } from '../core/mailbox-context.service';
import { ThemeService } from '../core/theme.service';
import type { Folder } from '../shared/models';
import { MobileNav } from './mobile-nav.service';

@Component({
  selector: 'stampyx-sidebar',
  imports: [TranslocoDirective, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
  host: { '[class.is-open]': 'nav.open()' },
})
export class Sidebar {
  protected readonly context = inject(MailboxContext);
  protected readonly me = inject(MeService);
  protected readonly theme = inject(ThemeService);
  protected readonly auth = inject(AuthService);
  protected readonly nav = inject(MobileNav);
  private readonly router = inject(Router);

  protected readonly systemFolders = computed(() =>
    this.context
      .folders()
      .filter((row) => row.system)
      .sort((a, b) => rank(a) - rank(b)),
  );

  protected readonly ownFolders = computed(() =>
    this.context.folders().filter((row) => !row.system),
  );

  protected readonly canManageDomains = computed(() => this.me.kind() !== 'mailbox');

  protected compose(): void {
    void this.router.navigate(['/inbox'], { queryParams: { compose: 1 } });
  }

  // In the URL, not just memory: otherwise a reload lands in INBOX and no folder can be linked.
  protected openFolder(folder: Folder): void {
    void this.router.navigate(['/inbox'], { queryParams: { folder: folder.path } });
  }

  // A badge means unread, not how much the folder holds. Drafts is the exception: a draft is
  // never unread, so it counts what is still unfinished.
  protected badge(folder: Folder): number {
    return folder.specialUse === '\\Drafts' ? folder.total : folder.unread;
  }

  protected iconFor(folder: Folder): string {
    const key = folder.path.toLowerCase();

    if (key === 'inbox') {
      return 'M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z';
    }

    if (key === 'sent') {
      return 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z';
    }

    if (key === 'drafts') {
      return 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z';
    }

    if (key === 'trash') {
      return 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6';
    }

    return 'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z';
  }
}

// Dovecot's folders in reading order; alphabetical would bury Sent under a custom "Arquivo".
const ORDER = ['inbox', 'sent', 'drafts', 'junk', 'spam', 'trash', 'archive'];

function rank(folder: Folder): number {
  return ORDER.indexOf(folder.path.toLowerCase());
}
