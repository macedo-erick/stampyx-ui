import { Component, effect, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Toast } from 'primeng/toast';

import { MeService } from '../core/api/me.service';
import { MailboxContext } from '../core/mailbox-context.service';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

@Component({
  selector: 'stampyx-shell',
  imports: [RouterOutlet, Toast, ConfirmDialog, TopBar, Sidebar],
  templateUrl: './shell.html',
  host: { class: 'flex h-full flex-col' },
})
export class Shell {
  private readonly me = inject(MeService);
  private readonly context = inject(MailboxContext);
  private readonly router = inject(Router);

  constructor() {
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
