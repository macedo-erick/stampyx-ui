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
  styleUrl: './inbox-page.css',
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
  protected readonly conversation = signal<MessageDetail[]>([]);
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  protected readonly detailsOpen = signal<ReadonlySet<string>>(new Set());

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

  protected readonly groups = computed(() => {
    const buckets = new Map<string, MessageSummary[]>();

    for (const row of this.visible()) {
      const key = this.dayKey(row.receivedAt);

      buckets.set(key, [...(buckets.get(key) ?? []), row]);
    }

    return [...buckets.entries()].map(([key, rows]) => ({ key, rows }));
  });

  constructor() {
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

    effect(() => {
      this.context.folder();
      this.mailboxId();
      this.refresh();
    });

    this.route.queryParamMap.subscribe((params) => {
      if (params.get('compose') !== null) {
        this.composeOpen.set(true);
      }

      this.context.selectFolder(params.get('folder') ?? 'INBOX');
      this.clearSelection();
    });

    this.realtime.received$.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.mailboxId !== this.mailboxId()) {
        return;
      }

      if (event.folder === this.context.folder()) {
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

    this.messages.thread(id, message.id).subscribe({
      next: (rows) => {
        const focus = rows.find((row) => row.id === message.id) ?? rows.at(-1) ?? null;

        this.conversation.set(rows);
        this.selected.set(focus);
        this.expanded.set(new Set(focus === null ? [] : [focus.id]));
        this.items.update((rows) =>
          rows.map((row) => (row.id === message.id ? { ...row, read: true } : row)),
        );

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

  protected onDraftSaved(): void {
    this.closeCompose();
    this.refresh();
    this.context.reloadFolders();
  }

  protected onDraftDiscarded(): void {
    this.closeCompose();
    this.refresh();
    this.context.reloadFolders();
  }

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

  protected closeMessage(): void {
    this.clearSelection();
  }

  protected startCompose(): void {
    this.seed.set(null);
    this.composeOpen.set(true);
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
      inReplyTo: message.messageId,
      body: '',
    });
    this.composeOpen.set(true);
  }

  protected startForward(message: MessageDetail): void {
    this.seed.set({
      to: [],
      subject: prefixed('Fwd:', message.subject),
      inReplyTo: null,
      body: quoted(message),
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

function quoted(message: MessageDetail): string {
  const body = message.text ?? '';

  return ['', '', `---------- ${message.sender} ----------`, body].join('\n');
}

function quotedHtml(message: MessageDetail): string {
  const header = `---------- ${escapeHtml(message.sender)} ----------`;

  return `<p><br></p><p>${header}</p>${message.html ?? ''}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
