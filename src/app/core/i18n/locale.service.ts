import { effect, inject, Service, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { PrimeNG } from 'primeng/config';

import {
  APP_LOCALES,
  AppLocale,
  currentLocale,
  LOCALE_STORAGE_KEY,
} from '../../shared/util/locale';
import { PRIMENG_TRANSLATIONS } from './primeng-translations';

@Service()
export class LocaleService {
  private readonly transloco = inject(TranslocoService);
  private readonly primeng = inject(PrimeNG);

  readonly locale = signal<AppLocale>(currentLocale());

  readonly available = APP_LOCALES;

  constructor() {
    effect(() => {
      const locale = this.locale();

      this.transloco.load(locale).subscribe(() => this.transloco.setActiveLang(locale));

      currentLocale.set(locale);
      document.documentElement.lang = locale;
      this.primeng.setTranslation(PRIMENG_TRANSLATIONS[locale]);

      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    });
  }

  set(locale: AppLocale): void {
    this.locale.set(locale);
  }

  label(locale: AppLocale): string {
    return locale === 'pt-BR' ? 'Português' : 'English';
  }
}
