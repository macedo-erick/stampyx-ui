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

// They differ only in the seed: a reply knows the recipient and threads; a forward starts empty.
export interface ComposeSeed {
  readonly to: string[];
  readonly cc?: string[];
  readonly subject: string;
  readonly inReplyTo: string | null;
  readonly body: string;
  // A draft reopens with the markup it was written with, not a flattened copy of it.
  readonly html?: string | null;
  // Saving or sending removes the draft it was opened from, rather than leaving half-written copies.
  readonly replacesDraftId?: string;
}

// Mirrors MAIL_MAX_ATTACHMENT_BYTES; the server enforces it either way, this only fills the bar first.
const MAX_ATTACHMENT_BYTES = 26_214_400;

@Component({
  selector: 'stampyx-compose-panel',
  imports: [TranslocoDirective, FormsModule, Editor],
  templateUrl: './compose-panel.html',
  styleUrl: './compose-panel.css',
  host: {
    '[class.is-minimized]': 'minimized()',
    '[class.is-dragging]': 'dragging()',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
  },
})
export class ComposePanel {
  readonly mailboxId = input.required<string>();
  readonly senders = input<readonly Mailbox[]>([]);
  // Set when the composer was opened from Reply: the fields arrive filled in.
  readonly seed = input<ComposeSeed | null>(null);
  readonly closed = output<void>();
  readonly sent = output<void>();
  // Distinct from `closed`: a saved draft lands under a new id, so the list must be refetched
  // or the dead row stays on screen and asks for a message that no longer exists.
  readonly saved = output<void>();
  // Also distinct from `closed`: discarding deletes the draft the composer was opened from,
  // so the list behind it is one row lighter and the folder counts have moved.
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
  protected readonly subject = signal('');
  protected readonly attachments = signal<DraftAttachment[]>([]);
  protected readonly sending = signal(false);
  protected readonly savingDraft = signal(false);
  protected readonly discarding = signal(false);
  protected readonly uploading = signal(false);
  protected readonly minimized = signal(false);
  protected readonly dragging = signal(false);
  private readonly prefilled = signal(false);

  // Written once, when the composer is seeded. Bound one way into the editor on purpose:
  // writing back on every keystroke would hand Quill a new value mid-edit and move the
  // caret to the end of it.
  protected readonly seedHtml = signal('');
  private readonly bodyHtml = signal('');
  private readonly bodyText = signal('');

  // The send goes out as mailboxId, so the header has to name that mailbox. Taking the first
  // sender on the account showed one address while the message left from another.
  protected readonly from = computed(
    () => this.senders().find((row) => row.id === this.mailboxId())?.address ?? '',
  );

  private readonly inReplyTo = signal<string | null>(null);
  private readonly replaces = signal<string | null>(null);

  constructor() {
    // Runs once on open; after that the fields belong to whoever is typing. No wait for the
    // editor any more: p-editor keeps a value written before Quill exists and applies it on
    // init, where the old element check dropped the body and opened a forward empty.
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

      // A draft reopens with the markup it was written with. Sanitized server-side on the
      // way out of IMAP, so what comes back is safe to mount.
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

    // Backspace on an empty field takes the previous chip, the way every mail client does.
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

  // Quill owns the editing surface, so the panel only has to keep what was typed. Both
  // shapes are kept: the message carries a plain-text part as well as an HTML one.
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
    // Quill leaves alignment and indent as its own CSS classes, which mean nothing in the
    // recipient's client, so they are rewritten as inline styles on the way out.
    const html = inlineQuillFormatting(raw);

    this.sending.set(true);

    this.messages
      .send(this.mailboxId(), {
        to: this.to(),
        cc: this.cc(),
        bcc: this.bcc(),
        subject: this.subject(),
        text,
        // Only when the body actually carries markup: a plain note should stay plain, not
        // arrive wrapped in the <p> Quill puts around every line.
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

  // A draft never reaches the MTA: it is filed in Drafts so it can be picked up from any
  // client. Saving replaces the previous one, so it comes back with a new id.
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

  // Discarding is not the same as closing. A composer opened from Drafts left that draft
  // sitting there, and since saving and sending are the only things that pass
  // `replacesDraftId`, sending the message was the only way to be rid of one. It goes where
  // any deleted message goes - Trash - so a mis-click is still recoverable.
  protected discard(): void {
    if (this.discarding()) {
      return;
    }

    const draftId = this.replaces();

    // Nothing was ever filed: a composer that is not backed by a draft has nothing to delete.
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
      // The draft survived, so the panel stays open with the text still in it rather than
      // closing over writing the user can no longer get back to.
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

// The commands whose pressed state the toolbar reflects.
// A forward seeds the body with the quoted original as plain text. Quill takes HTML, and
// handing it raw text would render the quote's own angle brackets as markup.
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
