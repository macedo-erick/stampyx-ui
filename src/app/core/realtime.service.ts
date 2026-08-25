import { DestroyRef, Service, inject, signal } from '@angular/core';
import { type Socket, io } from 'socket.io-client';

import { environment } from '../../environments/environment';
import type { MessageSummary } from '../shared/models';
import { AuthService } from './auth/auth.service';

export interface MailReceived {
  readonly id: string;
  readonly mailboxId: string;
  readonly messageId: string;
  readonly sender: string;
  readonly subject: string | null;
  readonly folder: string;
  readonly receivedAt: string;
}

@Service()
export class RealtimeService {
  private readonly auth = inject(AuthService);
  private socket: Socket | null = null;
  private joined: string | null = null;

  readonly connected = signal(false);
  readonly lastReceived = signal<MailReceived | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.disconnect());
  }

  join(mailboxId: string): void {
    this.ensureSocket();

    if (this.joined === mailboxId) {
      return;
    }

    if (this.joined !== null) {
      this.socket?.emit('inbox:leave', this.joined);
    }

    this.socket?.emit('inbox:join', mailboxId);
    this.joined = mailboxId;
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.joined = null;
    this.connected.set(false);
  }

  private ensureSocket(): void {
    if (this.socket !== null) {
      return;
    }

    // socket.io falls back to long-polling on its own, which matters behind a reverse
    // proxy that has not been told to pass Upgrade.
    this.socket = io(environment.socketUrl, {
      path: '/api/socket.io',
      transports: ['websocket', 'polling'],
      // The gateway drops a socket it cannot identify, and either session kind is valid.
      auth: { token: this.auth.token() },
    });

    this.socket.on('connect', () => {
      this.connected.set(true);

      if (this.joined !== null) {
        this.socket?.emit('inbox:join', this.joined);
      }
    });

    this.socket.on('disconnect', () => this.connected.set(false));
    this.socket.on('mail:received', (event: MailReceived) => this.lastReceived.set(event));
  }
}

export function toSummary(event: MailReceived): MessageSummary {
  return {
    id: event.id,
    messageId: event.messageId,
    sender: event.sender,
    subject: event.subject,
    folder: event.folder,
    receivedAt: event.receivedAt,
    read: false,
    spamScore: null,
  };
}
