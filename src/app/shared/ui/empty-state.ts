import { Component, input } from '@angular/core';

@Component({
  selector: 'stampyx-empty-state',
  template: `
    <div class="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
      <div class="stx-postmark h-16 w-16 text-[10px]" [style.color]="'var(--stx-muted-2)'">STX</div>
      <p class="font-medium">{{ heading() }}</p>
      @if (body(); as text) {
        <p class="max-w-sm text-sm" [style.color]="'var(--stx-muted)'">{{ text }}</p>
      }
      <ng-content />
    </div>
  `,
})
export class EmptyState {
  readonly heading = input.required<string>();
  readonly body = input<string>();
}
