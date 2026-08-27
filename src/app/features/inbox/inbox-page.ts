import { Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { MessageService as ToastService } from 'primeng/api';

import { MeService } from '../../core/api/me.service';
import { MessageService } from '../../core/api/message.service';
import { MailboxContext } from '../../core/mailbox-context.service';
import { RealtimeService, toSummary } from '../../core/realtime.service';
import type { MessageDetail, MessageSummary } from '../../shared/models';
import { EmptyState } from '../../shared/ui/empty-state';
import { currentLocale } from '../../shared/util/locale';
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
  // The conversation the open message belongs to, bodies included: the pane shows the whole
  // exchange stacked, the way a mail client does, rather than one message at a time.
  protected readonly conversation = signal<MessageDetail[]>([]);
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  // The full envelope - every recipient, the Message-ID, the folder - is reference material
  // rather than what a reader opens a message for, so it starts collapsed. Keyed by message
  // for the same reason `expanded` is: the pane shows a conversation, not one message.
  protected readonly detailsOpen = signal<ReadonlySet<string>>(new Set());

  // A Sent or Drafts list shows who the message went to; everywhere else, who wrote it.
  protected readonly showsRecipient = computed(
    () =>
      this.context.folder() === this.context.sentPath() ||
      this.context.folder() === this.context.draftsPath(),
  );
  protected readonly filter = signal<'all' | 'unread' | 'attachments'>('all');

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
      this.clearSelection();
    });

    // A push only belongs in the list the user is actually looking at. Subscribed, not
    // observed: as an effect this re-ran whenever the folder or the mailbox changed and
    // announced the last arrival over again, so switching folders rang for old mail.
    this.realtime.received$.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.mailboxId !== this.mailboxId()) {
        return;
      }

      if (event.folder === this.context.folder()) {
        // A refresh in flight can already have brought it in, and the mirror keys the row by
        // the same id, so the push must not put a second copy at the top.
        this.items.update((rows) =>
          rows.some((row) => row.id === event.id) ? rows : [toSummary(event), ...rows],
        );
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

    // A draft is unfinished writing, not something to read: it reopens in the composer with
    // the fields as they were left, and saving or sending replaces it.
    if (this.context.folder() === this.context.draftsPath()) {
      this.messages.read(id, message.id).subscribe({
        next: (detail) => {
          this.seed.set({
            to: [...detail.to],
            cc: [...detail.cc],
            subject: detail.subject ?? '',
            inReplyTo: null,
            body: detail.text ?? '',
            html: detail.html,
            replacesDraftId: detail.id,
          });
          this.composeOpen.set(true);
        },
        // A draft edited in another client leaves the same dead row behind. Silence made it
        // look like the click did nothing at all, so say it and reload the folder.
        error: () => {
          this.toast.add({
            severity: 'warn',
            summary: this.transloco.translate('inbox.draftGone'),
          });
          this.refresh();
        },
      });

      return;
    }

    // One request: the conversation comes back with the message in it, already marked read.
    // Opening used to cost a read plus a thread call, which is the traffic you were seeing.
    this.messages.thread(id, message.id).subscribe({
      next: (rows) => {
        const focus = rows.find((row) => row.id === message.id) ?? rows.at(-1) ?? null;

        this.conversation.set(rows);
        this.selected.set(focus);
        // Only the one that was clicked opens; the rest stay as headers, like any thread view.
        this.expanded.set(new Set(focus === null ? [] : [focus.id]));
        this.items.update((rows) =>
          rows.map((row) => (row.id === message.id ? { ...row, read: true } : row)),
        );

        // Only an unread message changes a folder badge. Reloading on every open made the
        // sidebar refetch for nothing, which is what showed up as a flicker on sent mail.
        if (wasUnread) {
          this.context.reloadFolders();
        }
      },
      error: () => {
        this.conversation.set([]);
        this.selected.set(null);
      },
    });
  }

  // Clicking a header both opens it and makes it the one the toolbar acts on.
  protected toggle(message: MessageDetail): void {
    this.selected.set(message);
    this.expanded.update((current) => {
      const next = new Set(current);

      if (next.has(message.id) && current.size > 1) {
        next.delete(message.id);
      } else {
        next.add(message.id);
      }

      return next;
    });
  }

  protected isExpanded(message: MessageDetail): boolean {
    return this.expanded().has(message.id);
  }

  protected toggleDetails(message: MessageDetail): void {
    this.detailsOpen.update((current) => {
      const next = new Set(current);

      if (!next.delete(message.id)) {
        next.add(message.id);
      }

      return next;
    });
  }

  protected showsDetails(message: MessageDetail): boolean {
    return this.detailsOpen().has(message.id);
  }

  // The oldest message names the conversation: every reply carries the same subject with a
  // prefix stacked on top.
  protected readonly threadSubject = computed(
    () => this.conversation()[0]?.subject ?? this.selected()?.subject ?? '',
  );

  protected preview(message: MessageDetail): string {
    const body = (message.text ?? '').replace(/\s+/g, ' ').trim();

    return body.length > 140 ? `${body.slice(0, 140)}…` : body;
  }

  protected archive(message: MessageDetail): void {
    const id = this.mailboxId();
    const target = this.context.archivePath();

    if (id === null || target === null) {
      return;
    }

    this.messages.move(id, message.id, target).subscribe(() => {
      this.items.update((rows) => rows.filter((row) => row.id !== message.id));
      this.clearSelection();
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
      this.clearSelection();
      this.context.reloadFolders();
    });
  }

  protected onSent(): void {
    this.closeCompose();
    this.refresh();
  }

  // Saving rewrites the draft: the old copy is removed from IMAP and a new one is appended,
  // so the row that is on screen points at a message that is gone. Refetching is what makes
  // the draft clickable again, and Drafts counts what it holds, so the badge moves too.
  protected onDraftSaved(): void {
    this.closeCompose();
    this.refresh();
    this.context.reloadFolders();
  }

  // Discarding deleted the draft, so the row it was opened from is gone and Drafts counts
  // one fewer. Same reload as a save, for the same reason.
  protected onDraftDiscarded(): void {
    this.closeCompose();
    this.refresh();
    this.context.reloadFolders();
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

  private clearSelection(): void {
    this.selected.set(null);
    this.conversation.set([]);
    this.expanded.set(new Set());
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
      // Flattening an HTML message into text costs it every link and every image, so the
      // markup travels when there is markup to travel.
      html: message.html === null ? null : quotedHtml(message),
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
      ? `${mb.toLocaleString(currentLocale(), {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })} MB`
      : `${String(Math.round(bytes / 1024))} KB`;
  }

  protected displayName(row: MessageSummary): string {
    return this.showsRecipient() ? (row.recipient ?? row.sender) : row.sender;
  }

  protected initials(address: string): string {
    return address.slice(0, 2).toUpperCase();
  }

  // Intl's `undefined` locale means the browser's, not the app's, so the dates stayed in
  // en-US however the panel was set. Reading the signal also re-renders them on a switch.
  protected time(iso: string): string {
    const at = new Date(iso);

    return at.toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' });
  }

  protected fullDate(iso: string): string {
    return new Date(iso).toLocaleString(currentLocale(), {
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

    return new Date(key).toLocaleDateString(currentLocale(), { day: '2-digit', month: 'short' });
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

function quotedHtml(message: MessageDetail): string {
  const header = `---------- ${escapeHtml(message.sender)} ----------`;

  return `<p><br></p><p>${header}</p>${message.html ?? ''}`;
}

// The sender is an address, not markup: it goes in as text even when the body around it
// is markup.
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
