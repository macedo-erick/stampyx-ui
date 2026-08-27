import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  type ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { MessageService as ToastService } from 'primeng/api';

import { MeService } from '../../core/api/me.service';
import { type BulkResult, MessageService } from '../../core/api/message.service';
import { MailboxContext } from '../../core/mailbox-context.service';
import { RealtimeService, toSummary } from '../../core/realtime.service';
import type { MessageDetail, MessageSummary } from '../../shared/models';
import { EmptyState } from '../../shared/ui/empty-state';
import { currentLocale } from '../../shared/util/locale';
import { ComposePanel, type ComposeSeed } from './compose-panel';

@Component({
  selector: 'stampyx-inbox-page',
  imports: [TranslocoDirective, NgTemplateOutlet, EmptyState, ComposePanel],
  templateUrl: './inbox-page.html',
  styleUrl: './inbox-page.css',
  host: {
    class: 'relative flex flex-1 flex-col overflow-hidden',
    '(document:click)': 'onDocumentClick()',
    '(document:keydown.escape)': 'closeMenu()',
    '(window:resize)': 'closeMenu()',
  },
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
  protected readonly checked = signal<ReadonlySet<string>>(new Set());
  protected readonly menu = signal<{ x: number; y: number; row: MessageSummary } | null>(null);
  private readonly menuEl = viewChild<ElementRef<HTMLElement>>('contextMenu');
  private anchor: string | null = null;
  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private pressed = false;

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

  protected readonly checkedIds = computed(() => [...this.checked()]);
  protected readonly checkedCount = computed(() => this.checked().size);
  protected readonly selecting = computed(() => this.checked().size > 0);

  protected readonly allChecked = computed(() => {
    const rows = this.visible();
    const ticked = this.checked();

    return rows.length > 0 && rows.every((row) => ticked.has(row.id));
  });

  protected readonly someChecked = computed(() => this.selecting() && !this.allChecked());

  protected readonly menuCount = computed(() => {
    const row = this.menu()?.row;

    if (row === undefined) {
      return 0;
    }

    return this.checked().has(row.id) ? this.checked().size : 1;
  });

  protected readonly inTrash = computed(
    () => this.context.trashPath() !== null && this.context.folder() === this.context.trashPath(),
  );

  protected readonly inArchive = computed(
    () =>
      this.context.archivePath() !== null && this.context.folder() === this.context.archivePath(),
  );

  protected readonly canFlag = computed(() => !this.inTrash());

  protected readonly canArchive = computed(
    () => this.context.archivePath() !== null && !this.inTrash() && !this.inArchive(),
  );

  protected readonly canRestore = computed(() => this.inTrash() || this.inArchive());

  protected readonly restoreLabel = computed(() =>
    this.inTrash() ? 'inbox.restore' : 'inbox.unarchive',
  );

  protected readonly deleteLabel = computed(() =>
    this.inTrash() ? 'inbox.deleteForever' : 'common.delete',
  );

  constructor() {
    effect(() => {
      this.menuEl()?.nativeElement.querySelector<HTMLButtonElement>('button')?.focus();
    });

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
      this.clearChecked();
      this.closeMenu();
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

    this.clearChecked();

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

    if (id === null || this.pressed) {
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
    this.archiveIds([message.id]);
  }

  protected remove(message: MessageDetail): void {
    this.removeIds([message.id]);
  }

  protected isChecked(id: string): boolean {
    return this.checked().has(id);
  }

  protected onCheck(event: MouseEvent, row: MessageSummary): void {
    event.preventDefault();
    event.stopPropagation();
    this.closeMenu();

    const rows = this.visible();
    const from = rows.findIndex((candidate) => candidate.id === this.anchor);
    const to = rows.findIndex((candidate) => candidate.id === row.id);

    this.checked.update((current) => {
      const next = new Set(current);

      if (event.shiftKey && from !== -1 && to !== -1) {
        for (const span of rows.slice(Math.min(from, to), Math.max(from, to) + 1)) {
          next.add(span.id);
        }
      } else if (!next.delete(row.id)) {
        next.add(row.id);
      }

      return next;
    });

    this.anchor = row.id;
  }

  protected toggleAll(): void {
    this.checked.set(this.allChecked() ? new Set() : new Set(this.visible().map((row) => row.id)));
    this.anchor = null;
  }

  protected clearChecked(): void {
    this.checked.set(new Set());
    this.anchor = null;
  }

  protected openMenu(event: MouseEvent, row: MessageSummary): void {
    event.preventDefault();
    this.showMenu(event.clientX, event.clientY, row);
  }

  protected pressStart(event: PointerEvent, row: MessageSummary): void {
    if (event.pointerType === 'mouse') {
      return;
    }

    this.pressEnd();
    this.pressTimer = setTimeout(() => {
      this.pressed = true;
      this.showMenu(event.clientX, event.clientY, row);
    }, LONG_PRESS_MS);
  }

  protected pressEnd(): void {
    if (this.pressTimer !== null) {
      clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
  }

  protected onDocumentClick(): void {
    if (this.pressed) {
      this.pressed = false;

      return;
    }

    this.closeMenu();
  }

  protected closeMenu(): void {
    this.pressed = false;
    this.menu.set(null);
  }

  protected menuTargets(): readonly string[] {
    const row = this.menu()?.row;

    if (row === undefined) {
      return [];
    }

    return this.checked().has(row.id) ? this.checkedIds() : [row.id];
  }

  private showMenu(x: number, y: number, row: MessageSummary): void {
    this.menu.set({
      x: Math.min(x, Math.max(8, window.innerWidth - MENU_WIDTH - 8)),
      y: Math.min(y, Math.max(8, window.innerHeight - MENU_HEIGHT - 8)),
      row,
    });
  }

  protected markRead(ids: readonly string[], read: boolean): void {
    const mailboxId = this.mailboxId();

    if (mailboxId === null || ids.length === 0) {
      return;
    }

    this.closeMenu();

    this.messages.bulkRead(mailboxId, ids, read).subscribe({
      next: (result) => {
        const touched = new Set(result.processed);

        this.items.update((rows) =>
          rows.map((row) => (touched.has(row.id) ? { ...row, read } : row)),
        );

        if (!read && this.conversation().some((row) => touched.has(row.id))) {
          this.clearSelection();
        }

        this.settle(result);
      },
      error: () => this.afterFailedBatch(),
    });
  }

  protected markUnread(message: MessageDetail): void {
    this.markRead([message.id], false);
  }

  protected moveIds(ids: readonly string[], folder: string): void {
    const mailboxId = this.mailboxId();

    if (mailboxId === null || ids.length === 0) {
      return;
    }

    this.closeMenu();

    this.messages.bulkMove(mailboxId, ids, folder).subscribe({
      next: (result) => this.drop(result),
      error: () => this.afterFailedBatch(),
    });
  }

  protected archiveIds(ids: readonly string[]): void {
    const target = this.context.archivePath();

    if (target !== null) {
      this.moveIds(ids, target);
    }
  }

  protected restoreIds(ids: readonly string[]): void {
    this.moveIds(ids, INBOX);
  }

  protected removeIds(ids: readonly string[]): void {
    const mailboxId = this.mailboxId();

    if (mailboxId === null || ids.length === 0) {
      return;
    }

    this.closeMenu();

    this.messages.bulkRemove(mailboxId, ids).subscribe({
      next: (result) => this.drop(result),
      error: () => this.afterFailedBatch(),
    });
  }

  private drop(result: BulkResult): void {
    const gone = new Set(result.processed);

    this.items.update((rows) => rows.filter((row) => !gone.has(row.id)));

    if (this.conversation().some((row) => gone.has(row.id))) {
      this.clearSelection();
    }

    this.settle(result);
  }

  private settle(result: BulkResult): void {
    this.clearChecked();
    this.context.reloadFolders();

    if (result.failed.length > 0) {
      this.toast.add({
        severity: 'warn',
        summary: this.transloco.translate('inbox.batchPartial', { count: result.failed.length }),
      });
      this.refresh();
    }
  }

  private afterFailedBatch(): void {
    this.refresh();
    this.context.reloadFolders();
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

const INBOX = 'INBOX';
const MENU_WIDTH = 216;
const MENU_HEIGHT = 232;
const LONG_PRESS_MS = 500;

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
