import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { provideTestingTransloco } from '../../../testing/transloco';
import { TranslatedTitleStrategy } from './translated-title.strategy';

const SNAPSHOT = {} as RouterStateSnapshot;

describe('TranslatedTitleStrategy', () => {
  let strategy: TranslatedTitleStrategy;
  let title: Title;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [provideTestingTransloco()],
      providers: [TranslatedTitleStrategy],
    });

    strategy = TestBed.inject(TranslatedTitleStrategy);
    title = TestBed.inject(Title);
  });

  // The route's title is a translation key; Angular's own tree walk is not what this class adds.
  function withRouteTitle(key: string | undefined) {
    vi.spyOn(strategy, 'buildTitle').mockReturnValue(key);
  }

  it('translates the route key and keeps the app name after it', () => {
    withRouteTitle('titles.inbox');

    strategy.updateTitle(SNAPSHOT);

    expect(title.getTitle()).toBe('Inbox · Stampyx');
  });

  it('shows the app name alone for a route that names no title', () => {
    withRouteTitle(undefined);

    strategy.updateTitle(SNAPSHOT);

    expect(title.getTitle()).toBe('Stampyx');
  });

  it('retitles the page when the language changes, without waiting for a navigation', () => {
    withRouteTitle('titles.insights');
    strategy.updateTitle(SNAPSHOT);

    const setTitle = vi.spyOn(title, 'setTitle');

    TestBed.inject(TranslocoService).setActiveLang('pt-BR');

    expect(setTitle).toHaveBeenCalledTimes(1);
    expect(setTitle.mock.calls[0][0]).toContain('· Stampyx');
  });

  it('stays quiet on a language change before the first navigation', () => {
    const setTitle = vi.spyOn(title, 'setTitle');

    TestBed.inject(TranslocoService).setActiveLang('pt-BR');

    expect(setTitle).not.toHaveBeenCalled();
  });

  it('retitles from the most recent route, not the first one it ever saw', () => {
    withRouteTitle('titles.inbox');
    strategy.updateTitle(SNAPSHOT);

    withRouteTitle('titles.settings');
    strategy.updateTitle(SNAPSHOT);

    expect(title.getTitle()).toBe('Settings · Stampyx');

    TestBed.inject(TranslocoService).setActiveLang('pt-BR');

    expect(title.getTitle()).toBe('Settings · Stampyx');
  });
});
