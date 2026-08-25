import { inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';

export type TranslateParams = Record<string, string | number>;

export type TranslateFn = (key: string, params?: TranslateParams) => string;

export function injectTranslate(): TranslateFn {
  const transloco = inject(TranslocoService);
  const activeLang = toSignal(transloco.langChanges$, {
    initialValue: transloco.getActiveLang(),
  });

  return (key, params) => {
    activeLang();
    return transloco.translate(key, params);
  };
}
