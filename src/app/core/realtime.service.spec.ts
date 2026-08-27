import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth/auth.service';
import { type MailReceived, RealtimeService } from './realtime.service';

const handlers = new Map<string, (payload: unknown) => void>();

vi.mock('socket.io-client', () => ({
  io: () => ({
    on: (event: string, handler: (payload: unknown) => void) => handlers.set(event, handler),
    emit: () => undefined,
    disconnect: () => undefined,
  }),
}));

function arrival(id: string): MailReceived {
  return {
    id,
    mailboxId: 'b1f0c2a4-0000-4000-8000-000000000000',
    messageId: `<${id}@stampyx.test>`,
    sender: 'alguem@example.test',
    subject: 'Assunto',
    folder: 'INBOX',
    receivedAt: '2026-08-25T23:00:00.000Z',
  };
}

function build(): RealtimeService {
  handlers.clear();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [RealtimeService, { provide: AuthService, useValue: { token: () => 'token' } }],
  });

  const service = TestBed.inject(RealtimeService);

  service.join('b1f0c2a4-0000-4000-8000-000000000000');

  return service;
}

function push(event: MailReceived): void {
  handlers.get('mail:received')?.(event);
}

describe('RealtimeService', () => {
  it('delivers an arrival to whoever is listening', () => {
    const service = build();
    const seen: string[] = [];

    service.received$.subscribe((event) => seen.push(event.id));
    push(arrival('first'));

    expect(seen).toEqual(['first']);
  });

  it('does not replay a past arrival to a listener that came later', () => {
    const service = build();

    push(arrival('first'));

    const seen: string[] = [];

    service.received$.subscribe((event) => seen.push(event.id));

    expect(seen).toEqual([]);

    push(arrival('second'));

    expect(seen).toEqual(['second']);
  });
});
