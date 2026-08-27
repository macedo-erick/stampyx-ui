import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { MessageService as ToastService } from 'primeng/api';
import { Editor, type EditorTextChangeEvent } from 'primeng/editor';

import { AttachmentService } from '../../core/api/attachment.service';
import { MessageService } from '../../core/api/message.service';
import type { DraftAttachment, Mailbox } from '../../shared/models';
import { hasFormatting, inlineQuillFormatting } from './quill-html';

export interface ComposeSeed {
  readonly to: string[];
  readonly cc?: string[];
  readonly subject: string;
  readonly inReplyTo: string | null;
  readonly body: string;
  readonly html?: string | null;
  readonly replacesDraftId?: string;
}

const MAX_ATTACHMENT_BYTES = 26_214_400;

@Component({
  selector: 'stampyx-compose-panel',
  imports: [TranslocoDirective, FormsModule, Editor],
  templateUrl: './compose-panel.html',
  styleUrl: './compose-panel.css',
  host: {
    class: 'stx-compose',
    '[class.is-minimized]': 'minimized()',
    '[class.is-formatting]': 'formatOpen()',
    '[class.is-dragging]': 'dragging()',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
  },
})
export class ComposePanel {
  readonly mailboxId = input.required<string>();
  readonly senders = input<readonly Mailbox[]>([]);
  readonly seed = input<ComposeSeed | null>(null);
  readonly closed = output<void>();
  readonly sent = output<void>();
  readonly saved = output<void>();
  readonly discarded = output<void>();

  private readonly messages = inject(MessageService);
  private readonly attachmentsApi = inject(AttachmentService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  private readonly picker = viewChild<ElementRef<HTMLInputElement>>('picker');

  protected readonly to = signal<string[]>([]);
  protected readonly cc = signal<string[]>([]);
  protected readonly bcc = signal<string[]>([]);
  protected readonly showCc = signal(false);
  protected readonly showBcc = signal(false);
  protected readonly formatOpen = signal(false);
  protected readonly subject = signal('');
  protected readonly attachments = signal<DraftAttachment[]>([]);
  protected readonly sending = signal(false);
  protected readonly savingDraft = signal(false);
  protected readonly discarding = signal(false);
  protected readonly uploading = signal(false);
  protected readonly minimized = signal(false);
  protected readonly dragging = signal(false);
  private readonly prefilled = signal(false);

  protected readonly seedHtml = signal('');
  private readonly bodyHtml = signal('');
  private readonly bodyText = signal('');

  protected readonly from = computed(
    () => this.senders().find((row) => row.id === this.mailboxId())?.address ?? '',
  );

  private readonly inReplyTo = signal<string | null>(null);
  private readonly replaces = signal<string | null>(null);

  constructor() {
    effect(() => {
      const context = this.seed();

      if (context === null || this.prefilled()) {
        return;
      }

      this.prefilled.set(true);
      this.to.set([...context.to]);
      this.cc.set([...(context.cc ?? [])]);
      this.showCc.set((context.cc ?? []).length > 0);
      this.subject.set(context.subject);
      this.inReplyTo.set(context.inReplyTo);
      this.replaces.set(context.replacesDraftId ?? null);

      const html =
        context.html != null && context.html !== ''
          ? context.html
          : context.body === ''
            ? ''
            : textToHtml(context.body);

      if (html !== '') {
        this.seedHtml.set(html);
        this.bodyHtml.set(html);
        this.bodyText.set(context.body);
      }
    });
  }

  protected readonly usedBytes = computed(() =>
    this.attachments().reduce((sum, row) => sum + row.sizeBytes, 0),
  );

  protected readonly quotaPercent = computed(() =>
    Math.min(100, Math.round((this.usedBytes() / MAX_ATTACHMENT_BYTES) * 100)),
  );

  protected readonly overQuota = computed(() => this.usedBytes() > MAX_ATTACHMENT_BYTES);

  protected readonly canSend = computed(
    () => this.to().length > 0 && !this.sending() && !this.uploading() && !this.overQuota(),
  );

  protected commit(list: 'to' | 'cc' | 'bcc', event: Event): void {
    const input = event.target as HTMLInputElement;
    const entries = input.value
      .split(/[,;\s]+/)
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.includes('@') && entry.length > 2);

    if (entries.length === 0) {
      return;
    }

    this.bucket(list).update((current) => [...new Set([...current, ...entries])]);
    input.value = '';
  }

  protected onKey(list: 'to' | 'cc' | 'bcc', event: KeyboardEvent): void {
    const input = event.target as HTMLInputElement;

    if (event.key === 'Enter' || event.key === ',' || event.key === ';') {
      event.preventDefault();
      this.commit(list, event);

      return;
    }

    if (event.key === 'Backspace' && input.value === '') {
      this.bucket(list).update((current) => current.slice(0, -1));
    }
  }

  protected drop(list: 'to' | 'cc' | 'bcc', address: string): void {
    this.bucket(list).update((current) => current.filter((entry) => entry !== address));
  }

  protected initials(address: string): string {
    return address.slice(0, 2).toUpperCase();
  }

  protected onBodyChange(event: EditorTextChangeEvent): void {
    this.bodyHtml.set(event.htmlValue ?? '');
    this.bodyText.set(event.textValue);
  }

  protected choose(): void {
    this.picker()?.nativeElement.click();
  }

  protected onPicked(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.attach(Array.from(input.files ?? []));
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.attach(Array.from(event.dataTransfer?.files ?? []));
  }

  protected discardAttachment(row: DraftAttachment): void {
    this.attachmentsApi.remove(this.mailboxId(), row.id).subscribe({
      next: () => this.attachments.update((current) => current.filter((it) => it.id !== row.id)),
      error: () => undefined,
    });
  }

  protected kindOf(row: DraftAttachment): string {
    const dot = row.fileName.lastIndexOf('.');

    return dot === -1 ? 'BIN' : row.fileName.slice(dot + 1, dot + 5).toUpperCase();
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

  protected send(): void {
    if (!this.canSend()) {
      if (this.to().length === 0) {
        this.toast.add({
          severity: 'warn',
          summary: this.transloco.translate('compose.recipientsRequired'),
        });
      }

      return;
    }

    const raw = this.bodyHtml();
    const text = this.bodyText();
    const html = inlineQuillFormatting(raw);

    this.sending.set(true);

    this.messages
      .send(this.mailboxId(), {
        to: this.to(),
        cc: this.cc(),
        bcc: this.bcc(),
        subject: this.subject(),
        text,
        ...(hasFormatting(raw) ? { html } : {}),
        ...(this.inReplyTo() === null ? {} : { inReplyTo: this.inReplyTo() as string }),
        ...(this.replaces() === null ? {} : { replacesDraftId: this.replaces() as string }),
        attachmentIds: this.attachments().map((row) => row.id),
      })
      .subscribe({
        next: () => {
          this.sending.set(false);
          this.toast.add({
            severity: 'success',
            summary: this.transloco.translate('compose.sent'),
          });
          this.sent.emit();
        },
        error: () => this.sending.set(false),
      });
  }

  protected saveDraft(): void {
    if (this.savingDraft()) {
      return;
    }

    const raw = this.bodyHtml();
    const html = inlineQuillFormatting(raw);

    this.savingDraft.set(true);

    this.messages
      .saveDraft(this.mailboxId(), {
        to: this.to(),
        cc: this.cc(),
        bcc: this.bcc(),
        subject: this.subject(),
        text: this.bodyText(),
        ...(hasFormatting(raw) ? { html } : {}),
        attachmentIds: this.attachments().map((row) => row.id),
        ...(this.replaces() === null ? {} : { replacesDraftId: this.replaces() as string }),
      })
      .subscribe({
        next: () => {
          this.savingDraft.set(false);
          this.toast.add({
            severity: 'success',
            summary: this.transloco.translate('compose.draftSaved'),
          });
          this.saved.emit();
        },
        error: () => this.savingDraft.set(false),
      });
  }

  protected close(): void {
    this.closed.emit();
  }

  protected discard(): void {
    if (this.discarding()) {
      return;
    }

    const draftId = this.replaces();

    if (draftId === null) {
      this.closed.emit();

      return;
    }

    this.discarding.set(true);

    this.messages.remove(this.mailboxId(), draftId).subscribe({
      next: () => {
        this.discarding.set(false);
        this.toast.add({
          severity: 'success',
          summary: this.transloco.translate('compose.draftDiscarded'),
        });
        this.discarded.emit();
      },
      error: () => {
        this.discarding.set(false);
        this.toast.add({
          severity: 'error',
          summary: this.transloco.translate('compose.discardFailed'),
        });
      },
    });
  }

  private attach(files: readonly File[]): void {
    if (files.length === 0) {
      return;
    }

    this.uploading.set(true);

    let pending = files.length;
    const done = (): void => {
      pending -= 1;

      if (pending === 0) {
        this.uploading.set(false);
      }
    };

    for (const file of files) {
      this.attachmentsApi.upload(this.mailboxId(), file).subscribe({
        next: (row) => {
          this.attachments.update((current) => [...current, row]);
          done();
        },
        error: () => {
          this.toast.add({
            severity: 'error',
            summary: this.transloco.translate('compose.attachmentFailed', { name: file.name }),
          });
          done();
        },
      });
    }
  }

  private bucket(list: 'to' | 'cc' | 'bcc') {
    return list === 'to' ? this.to : list === 'cc' ? this.cc : this.bcc;
  }
}

function textToHtml(text: string): string {
  return text
    .split('\n')
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
