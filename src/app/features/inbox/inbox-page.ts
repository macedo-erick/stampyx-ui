import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { MessageService as ToastService } from 'primeng/api';

import { MeService } from '../../core/api/me.service';
import { MessageService } from '../../core/api/message.service';
import { MailboxContext } from '../../core/mailbox-context.service';
import { RealtimeService, toSummary } from '../../core/realtime.service';
import type { MessageDetail, MessageSummary } from '../../shared/models';
import { EmptyState } from '../../shared/ui/empty-state';
import { ComposePanel, type ComposeSeed } from './compose-panel';

@Component({
  selector: 'stampyx-inbox-page',
  imports: [TranslocoDirective, EmptyState, ComposePanel],
  templateUrl: './inbox-page.html',
  // relative, so the composer can anchor itself to the bottom-right of the page
  host: { class: 'relative flex flex-1 flex-col overflow-hidden' },
})
export class InboxPage {
  protected readonly context = inject(MailboxContext);
  private readonly me = inject(MeService);
  private readonly messages = inject(MessageService);
  private readonly realtime = inject(RealtimeService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly items = signal<MessageSummary[]>([]);
  protected readonly selected = signal<MessageDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly composeOpen = signal(false);
  protected readonly seed = signal<ComposeSeed | null>(null);
  protected readonly filter = signal<'all' | 'unread' | 'attachments'>('all');
  // Collapsed by default: the full envelope is reference material, not what a reader opens
  // a message for.
  protected readonly detailsOpen = signal(false);

  protected readonly mailboxId = computed(() => this.context.currentId());
  protected readonly current = computed(() => this.context.current());

  protected readonly visible = computed(() => {
    const rows = this.items();

    return this.filter() === 'unread' ? rows.filter((row) => !row.read) : rows;
  });

  // Grouped so the list reads as a timeline rather than one undifferentiated column.
  protected readonly groups = computed(() => {
    const buckets = new Map<string, MessageSummary[]>();

    for (const row of this.visible()) {
      const key = this.dayKey(row.receivedAt);

      buckets.set(key, [...(buckets.get(key) ?? []), row]);
    }

    return [...buckets.entries()].map(([key, rows]) => ({ key, rows }));
  });

  constructor() {
    // Straight from /me: listing every domain to reach the mailboxes was an extra round per
    // domain, and a mailbox user is not allowed to list domains at all.
    effect(() => {
      if (this.me.me() !== undefined) {
        this.loading.set(false);
      }
    });

    effect(() => {
      const id = this.mailboxId();

      if (id !== null) {
        this.realtime.join(id);
      }
    });

    // Reloads whenever the shell switches folder or mailbox.
    effect(() => {
      this.context.folder();
      this.mailboxId();
      this.refresh();
    });

    this.route.queryParamMap.subscribe((params) => {
      if (params.get('compose') !== null) {
        this.composeOpen.set(true);
      }

      // The URL is the source of truth for which folder is open.
      this.context.selectFolder(params.get('folder') ?? 'INBOX');
      this.selected.set(null);
    });

    // A push only belongs in the list the user is actually looking at.
    effect(() => {
      const event = this.realtime.lastReceived();

      if (event === null || event.mailboxId !== this.mailboxId()) {
        return;
      }

      if (event.folder === this.context.folder()) {
        this.items.update((rows) => [toSummary(event), ...rows]);
      }

      this.toast.add({
        severity: 'info',
        summary: this.transloco.translate('inbox.newMail', { sender: event.sender }),
        detail: event.subject ?? '',
      });
    });
  }

  protected refresh(): void {
    const id = this.mailboxId();

    if (id === null) {
      this.items.set([]);

      return;
    }

    this.messages.list(id, this.context.folder()).subscribe({
      next: (page) => this.items.set([...page.content]),
      error: () => this.items.set([]),
    });
  }

  protected open(message: MessageSummary): void {
    const id = this.mailboxId();

    if (id === null) {
      return;
    }

    const wasUnread = !message.read;

    this.messages.read(id, message.id).subscribe((detail) => {
      this.selected.set(detail);
      this.detailsOpen.set(false);
      this.items.update((rows) =>
        rows.map((row) => (row.id === message.id ? { ...row, read: true } : row)),
      );

      // Only an unread message changes a folder badge. Reloading on every open made the
      // sidebar refetch for nothing, which is what showed up as a flicker on sent mail.
      if (wasUnread) {
        this.context.reloadFolders();
      }
    });
  }

  protected archive(message: MessageDetail): void {
    const id = this.mailboxId();
    const target = this.context.archivePath();

    if (id === null || target === null) {
      return;
    }

    this.messages.move(id, message.id, target).subscribe(() => {
      this.items.update((rows) => rows.filter((row) => row.id !== message.id));
      this.selected.set(null);
      this.context.reloadFolders();
    });
  }

  protected remove(message: MessageDetail): void {
    const id = this.mailboxId();

    if (id === null) {
      return;
    }

    this.messages.remove(id, message.id).subscribe(() => {
      this.items.update((rows) => rows.filter((row) => row.id !== message.id));
      this.selected.set(null);
      this.context.reloadFolders();
    });
  }

  protected onSent(): void {
    this.closeCompose();
    this.refresh();
  }

  // The compose flag has to leave the URL too: the sidebar navigates to ?compose=1, and
  // navigating to a URL the router is already on emits nothing, so the panel would never
  // reopen after the first time.
  protected closeCompose(): void {
    this.composeOpen.set(false);
    this.seed.set(null);

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { compose: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected startReply(message: MessageDetail): void {
    this.seed.set({
      to: [message.sender],
      subject: prefixed('Re:', message.subject),
      // Threads the reply onto the original, so a client groups the two together.
      inReplyTo: message.messageId,
      body: '',
    });
    this.composeOpen.set(true);
  }

  protected startForward(message: MessageDetail): void {
    this.seed.set({
      to: [],
      subject: prefixed('Fwd:', message.subject),
      // A forward opens a new thread: it is not a reply to the original.
      inReplyTo: null,
      body: quoted(message),
    });
    this.composeOpen.set(true);
  }

  protected download(message: MessageDetail, index: number): void {
    const id = this.mailboxId();

    if (id === null) {
      return;
    }

    this.messages.attachment(id, message.id, index).subscribe((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = message.attachments[index]?.filename ?? 'anexo';
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  protected humanSize(bytes: number): string {
    if (bytes < 1024) {
      return `${String(bytes)} B`;
    }

    const mb = bytes / (1024 * 1024);

    return mb >= 1
      ? `${mb.toFixed(1).replace('.', ',')} MB`
      : `${String(Math.round(bytes / 1024))} KB`;
  }

  protected initials(address: string): string {
    return address.slice(0, 2).toUpperCase();
  }

  // In Sent and Drafts the sender is always this mailbox, so the column worth a row's width
  // is who it went to.
  protected counterpart(row: MessageSummary): string {
    return this.context.outgoing() ? (row.recipient ?? row.sender) : row.sender;
  }

  protected time(iso: string): string {
    const at = new Date(iso);

    return at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  // The envelope wants the whole instant, not the time alone: a message read a week later
  // is the case where "14:32" tells the reader nothing.
  protected fullDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected dayLabel(key: string): string {
    const today = this.dayKey(new Date().toISOString());
    const yesterday = this.dayKey(new Date(Date.now() - 86_400_000).toISOString());

    if (key === today) {
      return this.transloco.translate('inbox.today');
    }

    if (key === yesterday) {
      return this.transloco.translate('inbox.yesterday');
    }

    return new Date(key).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
  }

  private dayKey(iso: string): string {
    return iso.slice(0, 10);
  }
}

function prefixed(prefix: string, subject: string | null): string {
  const value = subject ?? '';

  return value.toLowerCase().startsWith(prefix.toLowerCase()) ? value : `${prefix} ${value}`.trim();
}

// Plain-text quote, the way every client does it, so the recipient sees what was forwarded.
function quoted(message: MessageDetail): string {
  const body = message.text ?? '';

  return ['', '', `---------- ${message.sender} ----------`, body].join('\n');
}
