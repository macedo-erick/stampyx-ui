import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { CrudService } from './crud-service';

interface Widget {
  readonly id: string;
  readonly name: string;
}

const BASE_URL = `${environment.apiUrl}/widgets`;

@Injectable()
class WidgetService extends CrudService<Widget, { name: string }> {
  constructor() {
    super('widgets');
  }
}

describe('CrudService', () => {
  let service: WidgetService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), WidgetService],
    });

    service = TestBed.inject(WidgetService);
    http = TestBed.inject(HttpTestingController);
  });

  async function settle() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    TestBed.tick();
  }

  async function load(items: Widget[] = [{ id: 'w1', name: 'First' }]) {
    TestBed.tick();
    http.expectOne(BASE_URL).flush(items);
    await settle();
  }

  it('builds its URL from the resource path, so a subclass names only its collection', async () => {
    TestBed.tick();

    expect(http.expectOne(BASE_URL).request.method).toBe('GET');
  });

  it('starts with an empty collection rather than undefined', () => {
    expect(service.items()).toEqual([]);
    expect(service.hasError()).toBe(false);
  });

  it('exposes what the collection responded with', async () => {
    await load();

    expect(service.items()).toEqual([{ id: 'w1', name: 'First' }]);
  });

  it('finds a loaded item by id without going back to the server', async () => {
    await load([
      { id: 'w1', name: 'First' },
      { id: 'w2', name: 'Second' },
    ]);

    expect(service.byId('w2')).toEqual({ id: 'w2', name: 'Second' });
    http.expectNone(`${BASE_URL}/w2`);
  });

  it('reports a missing id as absent rather than throwing', async () => {
    await load();

    expect(service.byId('nope')).toBeUndefined();
  });

  it('refetches the collection after a create', async () => {
    await load([]);

    service.create({ name: 'First' }).subscribe();

    const created = http.expectOne(BASE_URL);

    expect(created.request.method).toBe('POST');
    expect(created.request.body).toEqual({ name: 'First' });
    created.flush({ id: 'w1', name: 'First' });
    await settle();

    http.expectOne(BASE_URL).flush([{ id: 'w1', name: 'First' }]);
    await settle();

    expect(service.items()).toHaveLength(1);
  });

  it('addresses one item by id on update, and refetches the collection after', async () => {
    await load();

    service.update('w1', { name: 'Renamed' }).subscribe();

    const updated = http.expectOne(`${BASE_URL}/w1`);

    expect(updated.request.method).toBe('PUT');
    updated.flush({ id: 'w1', name: 'Renamed' });
    await settle();

    http.expectOne(BASE_URL).flush([{ id: 'w1', name: 'Renamed' }]);
    await settle();

    expect(service.items()).toEqual([{ id: 'w1', name: 'Renamed' }]);
  });

  it('refetches after a delete, so the removed item leaves the collection', async () => {
    await load();

    service.remove('w1').subscribe();

    const removed = http.expectOne(`${BASE_URL}/w1`);

    expect(removed.request.method).toBe('DELETE');
    removed.flush(null);
    await settle();

    http.expectOne(BASE_URL).flush([]);
    await settle();

    expect(service.items()).toEqual([]);
  });

  it('reports a failed collection load, and refuses to hand back items until it is retried', async () => {
    TestBed.tick();
    http.expectOne(BASE_URL).flush('nope', { status: 500, statusText: 'Server Error' });
    await settle();

    expect(service.hasError()).toBe(true);
    expect(() => service.items()).toThrow();
  });

  it('recovers on a reload, so a retry clears the error rather than needing a refresh', async () => {
    TestBed.tick();
    http.expectOne(BASE_URL).flush('nope', { status: 500, statusText: 'Server Error' });
    await settle();

    service.reload();
    await settle();

    http.expectOne(BASE_URL).flush([{ id: 'w1', name: 'First' }]);
    await settle();

    expect(service.hasError()).toBe(false);
    expect(service.items()).toEqual([{ id: 'w1', name: 'First' }]);
  });
});
