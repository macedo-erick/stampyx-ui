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
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { MessageService as ToastService } from 'primeng/api';

import { AttachmentService } from '../../core/api/attachment.service';
import { MessageService } from '../../core/api/message.service';
import type { DraftAttachment, Mailbox } from '../../shared/models';

// What the toolbar can hand to execCommand. Deprecated on paper, but it is still the only
// contenteditable formatting API every browser implements, and a real editor engine is a
// dependency this panel does not need.
type InlineCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikeThrough'
  | 'insertUnorderedList'
  | 'insertOrderedList'
  | 'justifyLeft'
  | 'justifyCenter'
  | 'justifyRight'
  | 'outdent'
  | 'indent';

type BlockTag = 'p' | 'h1' | 'h2' | 'h3' | 'blockquote' | 'pre';

// Reply and Forward differ only in what they seed: a reply knows the recipient and threads
// onto the original, a forward starts with an empty To and carries the text along.
export interface ComposeSeed {
  readonly to: string[];
  readonly subject: string;
  readonly inReplyTo: string | null;
  readonly body: string;
}

// Mirrors MAIL_MAX_ATTACHMENT_BYTES. The server enforces it either way; this is only so the
// bar can fill before a doomed upload leaves the browser.
const MAX_ATTACHMENT_BYTES = 26_214_400;

@Component({
  selector: 'stampyx-compose-panel',
  imports: [TranslocoDirective],
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

  private readonly messages = inject(MessageService);
  private readonly attachmentsApi = inject(AttachmentService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  private readonly editor = viewChild<ElementRef<HTMLElement>>('editor');
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
  protected readonly uploading = signal(false);
  protected readonly minimized = signal(false);
  protected readonly dragging = signal(false);
  private readonly prefilled = signal(false);

  // The send goes out as mailboxId, so the header has to name that mailbox. Taking the first
  // sender on the account showed one address while the message left from another.
  protected readonly from = computed(
    () => this.senders().find((row) => row.id === this.mailboxId())?.address ?? '',
  );

  private readonly inReplyTo = signal<string | null>(null);

  constructor() {
    // Runs once, when the panel opens: after that the fields belong to whoever is typing.
    effect(() => {
      const context = this.seed();

      if (context === null || this.prefilled()) {
        return;
      }

      this.prefilled.set(true);
      this.to.set([...context.to]);
      this.subject.set(context.subject);
      this.inReplyTo.set(context.inReplyTo);

      const editor = this.editor()?.nativeElement;

      if (editor !== undefined && context.body !== '') {
        editor.innerText = context.body;
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

  protected format(command: InlineCommand): void {
    this.editor()?.nativeElement.focus();
    document.execCommand(command);
  }

  // formatBlock wants the tag in angle brackets: the bare name works in Chrome and is
  // ignored by Firefox, which is how headings silently did nothing there.
  protected block(tag: BlockTag): void {
    this.editor()?.nativeElement.focus();
    document.execCommand('formatBlock', false, `<${tag}>`);
  }

  protected addLink(): void {
    const href = window.prompt(this.transloco.translate('compose.linkPrompt'));

    if (href === null || href.trim() === '') {
      return;
    }

    this.editor()?.nativeElement.focus();
    // Bare hostnames become relative URLs, which resolve against the panel rather than the
    // site the writer meant.
    document.execCommand('createLink', false, withScheme(href.trim()));
  }

  // execCommand leaves the block wrapper behind, so a cleared heading stays a heading.
  protected clearFormatting(): void {
    this.editor()?.nativeElement.focus();
    document.execCommand('removeFormat');
    document.execCommand('formatBlock', false, '<p>');
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

    const element = this.editor()?.nativeElement;
    const html = element?.innerHTML ?? '';
    const text = element?.innerText ?? '';

    this.sending.set(true);

    this.messages
      .send(this.mailboxId(), {
        to: this.to(),
        cc: this.cc(),
        bcc: this.bcc(),
        subject: this.subject(),
        text,
        // Only when the body actually carries markup: a plain note should stay plain.
        ...(html.includes('<') ? { html } : {}),
        ...(this.inReplyTo() === null ? {} : { inReplyTo: this.inReplyTo() as string }),
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
  // client. Reopening one to keep editing is not built yet.
  protected saveDraft(): void {
    if (this.savingDraft()) {
      return;
    }

    const element = this.editor()?.nativeElement;
    const html = element?.innerHTML ?? '';

    this.savingDraft.set(true);

    this.messages
      .saveDraft(this.mailboxId(), {
        to: this.to(),
        cc: this.cc(),
        bcc: this.bcc(),
        subject: this.subject(),
        text: element?.innerText ?? '',
        ...(html.includes('<') ? { html } : {}),
        attachmentIds: this.attachments().map((row) => row.id),
      })
      .subscribe({
        next: () => {
          this.savingDraft.set(false);
          this.toast.add({
            severity: 'success',
            summary: this.transloco.translate('compose.draftSaved'),
          });
          this.closed.emit();
        },
        error: () => this.savingDraft.set(false),
      });
  }

  protected close(): void {
    this.closed.emit();
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

function withScheme(href: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//') ? href : `https://${href}`;
}
