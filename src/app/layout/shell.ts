import { Component, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Toast } from 'primeng/toast';
import { TranslocoDirective } from '@jsverse/transloco';

import { MeService } from '../core/api/me.service';
import { MailboxContext } from '../core/mailbox-context.service';
import { MobileNav } from './mobile-nav.service';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

@Component({
  selector: 'stampyx-shell',
  imports: [RouterOutlet, Toast, ConfirmDialog, TranslocoDirective, TopBar, Sidebar],
  templateUrl: './shell.html',
  host: { class: 'flex h-full flex-col', '(document:keydown.escape)': 'nav.close()' },
})
export class Shell {
  protected readonly nav = inject(MobileNav);
  private readonly me = inject(MeService);
  private readonly context = inject(MailboxContext);
  private readonly router = inject(Router);

  constructor() {
    // Every drawer row navigates, so this covers the folder buttons and routerLinks alike.
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.nav.close();
      }
    });

    // An account that signed up but never picked an address has no inbox to show yet.
    effect(() => {
      if (this.me.shouldPromptAddress()) {
        void this.router.navigateByUrl('/onboarding');
      }
    });

    // The folder list belongs to a mailbox, so it can only load once /me has answered.
    effect(() => {
      if (this.context.currentId() !== null) {
        this.context.reloadFolders();
      }
    });
  }
}
