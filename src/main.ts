import { bootstrapApplication } from '@angular/platform-browser';

import { App } from './app/app';
import { appConfig } from './app/app.config';
import { currentLocale } from './app/shared/util/locale';

document.documentElement.lang = currentLocale();

bootstrapApplication(App, appConfig).catch((err: unknown) => console.error(err));
