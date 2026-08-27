import { Component, input } from '@angular/core';

@Component({
  selector: 'stampyx-page-header',
  template: `
    <header
      class="stx-page-head flex shrink-0 items-center justify-between gap-4 border-b px-6 py-4"
      [style.borderColor]="'var(--stx-line)'"
    >
      <div class="min-w-0">
        @if (eyebrow(); as text) {
          <!-- A long hint wrapped to three lines of uppercase mono on a phone, pushing the
               heading down and squeezing the action beside it. One line, always. -->
          <div
            class="stx-mono truncate text-[11px] uppercase tracking-widest"
            [style.color]="'var(--stx-muted-2)'"
          >
            {{ text }}
          </div>
        }
        <h1 class="truncate text-lg font-semibold">{{ heading() }}</h1>
      </div>

      <div class="stx-page-head-actions flex shrink-0 items-center gap-2">
        <ng-content />
      </div>
    </header>
  `,
})
export class PageHeader {
  readonly heading = input.required<string>();
  readonly eyebrow = input<string>();
}
