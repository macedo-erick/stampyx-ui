import { Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { MessageService as ToastService } from 'primeng/api';

import { MeService } from '../../core/api/me.service';
import { ThemeService } from '../../core/theme.service';
import type { PlatformDomain } from '../../shared/models';

@Component({
  selector: 'stampyx-onboarding-page',
  imports: [TranslocoDirective],
  templateUrl: './onboarding-page.html',
  styleUrl: './onboarding-page.css',
})
export class OnboardingPage {
  protected readonly theme = inject(ThemeService);
  private readonly me = inject(MeService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly domains = signal<PlatformDomain[]>([]);
  protected readonly domainId = signal<string | null>(null);
  protected readonly localPart = signal('');
  protected readonly available = signal<boolean | null>(null);
  protected readonly checking = signal(false);
  protected readonly saving = signal(false);
  protected readonly prefilled = signal(false);

  constructor() {
    this.me.platformDomains().subscribe((rows) => {
      this.domains.set(rows);
      this.domainId.set(this.me.suggestedDomainId() ?? rows[0]?.id ?? null);
    });

    // Someone who signed up as erick@stampyx.com already chose their address; the field
    // arrives filled and checked instead of empty.
    effect(() => {
      const suggested = this.me.suggestedLocalPart();

      if (suggested !== null && this.localPart() === '' && !this.prefilled()) {
        this.prefilled.set(true);
        this.localPart.set(suggested);
        this.check();
      }
    });

    effect(() => {
      if (this.me.me() !== undefined && !this.me.needsAddress()) {
        void this.router.navigateByUrl('/inbox');
      }
    });
  }

  protected check(): void {
    const domainId = this.domainId();
    const localPart = this.localPart().trim().toLowerCase();

    if (domainId === null || localPart === '') {
      this.available.set(null);

      return;
    }

    this.checking.set(true);

    this.me.availability(domainId, localPart).subscribe({
      next: (result) => {
        this.available.set(result.available);
        this.checking.set(false);
      },
      error: () => {
        this.available.set(null);
        this.checking.set(false);
      },
    });
  }

  protected claim(): void {
    const domainId = this.domainId();
    const localPart = this.localPart().trim().toLowerCase();

    if (domainId === null || localPart === '' || this.saving()) {
      return;
    }

    this.saving.set(true);

    this.me.claimAddress(domainId, localPart).subscribe({
      next: (mailbox) => {
        this.saving.set(false);
        this.toast.add({ severity: 'success', summary: mailbox.address });
        void this.router.navigateByUrl('/inbox');
      },
      error: () => {
        this.saving.set(false);
        this.available.set(false);
      },
    });
  }

  protected skip(): void {
    this.me.dismissAddressPrompt();
    void this.router.navigateByUrl('/inbox');
  }

  protected domainName(): string {
    return this.domains().find((row) => row.id === this.domainId())?.name ?? '';
  }
}
