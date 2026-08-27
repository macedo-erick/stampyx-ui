import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { TranslocoService, provideTransloco } from '@jsverse/transloco';
import Aura from '@primeuix/themes/aura';
import { includeBearerTokenInterceptor } from 'keycloak-angular';
import { ConfirmationService, MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';

import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { keycloakBearerTokenConfig, provideKeycloakAuth } from './core/auth/keycloak.providers';
import { stampyxTokenInterceptor } from './core/auth/stampyx-token.interceptor';
import { errorInterceptor } from './core/http/error.interceptor';
import { TranslatedTitleStrategy } from './core/i18n/translated-title.strategy';
import { TranslationLoader } from './core/i18n/translation-loader';
import { APP_LOCALES, currentLocale } from './shared/util/locale';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideKeycloakAuth(),
    keycloakBearerTokenConfig,
    provideHttpClient(
      withInterceptors([stampyxTokenInterceptor, includeBearerTokenInterceptor, errorInterceptor]),
    ),
    providePrimeNG({
      license: environment.primeNgLicense,
      overlayAppendTo: 'body',
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.app-dark',
          cssLayer: { name: 'primeng', order: 'theme, base, primeng' },
        },
      },
    }),
    provideTransloco({
      config: {
        availableLangs: [...APP_LOCALES],
        defaultLang: currentLocale(),
        fallbackLang: 'en-US',
        reRenderOnLangChange: true,
        prodMode: environment.production,
      },
      loader: TranslationLoader,
    }),
    provideAppInitializer(() => inject(TranslocoService).load(currentLocale())),
    { provide: TitleStrategy, useClass: TranslatedTitleStrategy },
    MessageService,
    ConfirmationService,
  ],
};
