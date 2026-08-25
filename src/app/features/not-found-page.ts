import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

@Component({
  selector: 'stampyx-not-found-page',
  imports: [RouterLink, TranslocoDirective],
  template: `
    <section *transloco="let t" class="flex flex-1 flex-col items-center justify-center gap-3 p-8">
      <div class="stx-postmark h-24 w-24 text-xs" [style.color]="'var(--stx-stamp)'">404</div>
      <h1 class="text-xl font-semibold">{{ t('notFound.title') }}</h1>
      <p [style.color]="'var(--stx-muted)'">{{ t('notFound.body') }}</p>
      <a routerLink="/inbox" class="underline">{{ t('notFound.back') }}</a>
    </section>
  `,
  host: { class: 'flex flex-1' },
})
export class NotFoundPage {}
