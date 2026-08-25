import { Component, computed, effect, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';

import { type RuleBody, RuleService } from '../../core/api/rule.service';
import { MailboxContext } from '../../core/mailbox-context.service';
import type { FolderRule, RuleAction, RuleField, RuleOperator } from '../../shared/models';
import { EmptyState } from '../../shared/ui/empty-state';
import { PageHeader } from '../../shared/ui/page-header';

const FIELDS: RuleField[] = ['sender', 'subject', 'recipient'];
const OPERATORS: RuleOperator[] = ['contains', 'equals', 'starts_with', 'ends_with'];
const ACTIONS: RuleAction[] = ['move_to', 'mark_read', 'forward', 'discard'];

@Component({
  selector: 'stampyx-rules-page',
  imports: [TranslocoDirective, PageHeader, EmptyState],
  templateUrl: './rules-page.html',
  host: { class: 'flex flex-1 flex-col overflow-hidden' },
})
export class RulesPage {
  protected readonly context = inject(MailboxContext);
  private readonly rules = inject(RuleService);

  protected readonly fields = FIELDS;
  protected readonly operators = OPERATORS;
  protected readonly actions = ACTIONS;

  protected readonly items = signal<FolderRule[]>([]);
  protected readonly editing = signal<FolderRule | null>(null);
  protected readonly draftOpen = signal(false);
  protected readonly draft = signal<RuleBody>(emptyDraft());
  protected readonly saving = signal(false);

  protected readonly mailboxId = computed(() => this.context.currentId());

  protected readonly folderOptions = computed(() => this.context.folders());

  // Debounced: the condition changes on every keystroke and each preview is a query.
  private readonly previewKey = computed(() => {
    const draft = this.draft();

    return this.draftOpen() && draft.conditionValue.trim() !== ''
      ? JSON.stringify({
          mailboxId: this.mailboxId(),
          field: draft.conditionField,
          operator: draft.conditionOperator,
          value: draft.conditionValue.trim(),
        })
      : '';
  });

  protected readonly preview = toSignal(
    toObservable(this.previewKey).pipe(
      debounceTime(350),
      distinctUntilChanged(),
      switchMap((key) => {
        if (key === '') {
          return of(null);
        }

        const parsed = JSON.parse(key) as {
          mailboxId: string | null;
          field: RuleField;
          operator: RuleOperator;
          value: string;
        };

        if (parsed.mailboxId === null) {
          return of(null);
        }

        return this.rules.preview(parsed.mailboxId, {
          conditionField: parsed.field,
          conditionOperator: parsed.operator,
          conditionValue: parsed.value,
        });
      }),
    ),
    { initialValue: null },
  );

  constructor() {
    effect(() => {
      this.mailboxId();
      this.refresh();
    });
  }

  protected refresh(): void {
    const id = this.mailboxId();

    if (id === null) {
      this.items.set([]);

      return;
    }

    this.rules.list(id).subscribe({
      next: (rows) => this.items.set(rows),
      error: () => this.items.set([]),
    });
  }

  protected open(rule: FolderRule | null): void {
    this.editing.set(rule);
    this.draft.set(
      rule === null
        ? emptyDraft()
        : {
            conditionField: rule.conditionField,
            conditionOperator: rule.conditionOperator,
            conditionValue: rule.conditionValue,
            action: rule.action,
            targetFolder: rule.targetFolder,
            active: rule.active,
          },
    );
    this.draftOpen.set(true);
  }

  protected patch(patch: Partial<RuleBody>): void {
    this.draft.update((draft) => ({ ...draft, ...patch }));
  }

  protected setAction(action: RuleAction): void {
    // Only move_to carries a folder; leaving a stale one would fail the server's check.
    this.patch({ action, ...(action === 'move_to' ? {} : { targetFolder: null }) });
  }

  protected toggleActive(rule: FolderRule): void {
    const id = this.mailboxId();

    if (id === null) {
      return;
    }

    this.rules
      .update(id, rule.id, {
        conditionField: rule.conditionField,
        conditionOperator: rule.conditionOperator,
        conditionValue: rule.conditionValue,
        action: rule.action,
        targetFolder: rule.targetFolder,
        active: !rule.active,
      })
      .subscribe(() => this.refresh());
  }

  protected save(): void {
    const id = this.mailboxId();
    const draft = this.draft();

    if (id === null || draft.conditionValue.trim() === '' || this.saving()) {
      return;
    }

    this.saving.set(true);

    const editing = this.editing();
    const request =
      editing === null ? this.rules.create(id, draft) : this.rules.update(id, editing.id, draft);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.draftOpen.set(false);
        this.refresh();
      },
      error: () => this.saving.set(false),
    });
  }

  protected remove(rule: FolderRule): void {
    const id = this.mailboxId();

    if (id === null) {
      return;
    }

    this.rules.remove(id, rule.id).subscribe(() => {
      this.draftOpen.set(false);
      this.refresh();
    });
  }

  // The API insists on a full permutation, so the whole list is sent every time.
  protected move(rule: FolderRule, delta: number): void {
    const id = this.mailboxId();
    const ordered = [...this.items()];
    const from = ordered.findIndex((row) => row.id === rule.id);
    const to = from + delta;

    if (id === null || from < 0 || to < 0 || to >= ordered.length) {
      return;
    }

    const [moved] = ordered.splice(from, 1);

    if (moved === undefined) {
      return;
    }

    ordered.splice(to, 0, moved);

    this.rules
      .reorder(
        id,
        ordered.map((row) => row.id),
      )
      .subscribe((rows) => this.items.set(rows));
  }
}

function emptyDraft(): RuleBody {
  return {
    conditionField: 'sender',
    conditionOperator: 'contains',
    conditionValue: '',
    action: 'move_to',
    targetFolder: null,
    active: true,
  };
}
