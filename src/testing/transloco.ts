import { TranslocoTestingModule } from '@jsverse/transloco';

import en from '../../public/i18n/en-US.json';
import { APP_LOCALES } from '../app/shared/util/locale';

export function provideTestingTransloco() {
  return TranslocoTestingModule.forRoot({
    langs: Object.fromEntries(APP_LOCALES.map((lang) => [lang, en])),
    translocoConfig: { availableLangs: [...APP_LOCALES], defaultLang: 'en-US' },
    preloadLangs: true,
  });
}
