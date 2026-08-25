import { inject, Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';

const SUFFIX = 'Stampyx';

@Injectable()
export class TranslatedTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly transloco = inject(TranslocoService);

  private latest: RouterStateSnapshot | null = null;

  constructor() {
    super();
    this.transloco.langChanges$.subscribe(() => {
      if (this.latest) {
        this.updateTitle(this.latest);
      }
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.latest = snapshot;

    const key = this.buildTitle(snapshot);
    if (!key) {
      this.title.setTitle(SUFFIX);
      return;
    }

    this.title.setTitle(`${this.transloco.translate(key)} · ${SUFFIX}`);
  }
}
