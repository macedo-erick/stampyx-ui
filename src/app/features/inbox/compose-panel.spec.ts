import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { beforeEach, describe, expect, it } from 'vitest';

import { provideTestingTransloco } from '../../../testing/transloco';
import { ComposePanel, type ComposeSeed } from './compose-panel';

function open(seed: ComposeSeed) {
  const fixture = TestBed.createComponent(ComposePanel);

  fixture.componentRef.setInput('mailboxId', '9f1d2c3b-0000-4000-8000-000000000000');
  fixture.componentRef.setInput('seed', seed);
  fixture.detectChanges();

  return fixture;
}

describe('ComposePanel', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [provideTestingTransloco()],
      providers: [provideHttpClient(), provideHttpClientTesting(), MessageService],
    });
  });

  // The seeding effect can run before the view exists; marking it applied on that pass opened
  // a forward with its subject filled in and an empty message.
  it('puts the seeded body in the editor', () => {
    const fixture = open({
      to: [],
      subject: 'Fwd: Teste',
      inReplyTo: null,
      body: '---------- someone@example.test ----------\nOriginal message',
    });

    const editor: HTMLElement = fixture.nativeElement.querySelector('[role="textbox"]');

    expect(editor.innerText).toContain('Original message');
  });

  it('keeps the markup when the seed carries html', () => {
    const fixture = open({
      to: [],
      subject: 'Fwd: Teste',
      inReplyTo: null,
      body: 'flattened',
      html: '<p>Original <a href="https://example.test">link</a></p>',
    });

    const editor: HTMLElement = fixture.nativeElement.querySelector('[role="textbox"]');

    expect(editor.innerHTML).toContain('href="https://example.test"');
  });

  // Saving files a new copy under a new id, so the row on screen is dead; `closed` alone left it there.
  it('reports a saved draft as saved, not merely closed', () => {
    const fixture = open({ to: [], subject: 'Rascunho', inReplyTo: null, body: 'meio escrito' });

    let saved = 0;
    let closed = 0;

    fixture.componentInstance.saved.subscribe(() => (saved += 1));
    fixture.componentInstance.closed.subscribe(() => (closed += 1));

    const buttons: HTMLButtonElement[] = [...fixture.nativeElement.querySelectorAll('button')];

    buttons.find((button) => button.classList.contains('discard'))?.click();

    TestBed.inject(HttpTestingController)
      .expectOne((request) => request.method === 'POST' && request.url.endsWith('/drafts'))
      .flush(null);

    expect(saved).toBe(1);
    expect(closed).toBe(0);
  });

  it('fills the recipients a reply was opened with', () => {
    const fixture = open({
      to: ['someone@example.test'],
      cc: ['other@example.test'],
      subject: 'Re: Teste',
      inReplyTo: '<parent@example.test>',
      body: '',
    });

    expect(fixture.nativeElement.textContent).toContain('someone@example.test');
    expect(fixture.nativeElement.textContent).toContain('other@example.test');
  });
});
