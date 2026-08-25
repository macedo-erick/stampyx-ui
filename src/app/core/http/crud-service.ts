import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Uuid } from '../../shared/models/common';

export abstract class CrudService<TModel extends { readonly id: Uuid }, TRequest> {
  protected readonly http = inject(HttpClient);
  private readonly baseUrl: string;

  readonly resource = httpResource<TModel[]>(() => this.baseUrl, { defaultValue: [] });

  readonly items = computed(() => this.resource.value());
  readonly isLoading = computed(() => this.resource.isLoading());
  readonly hasError = computed(() => this.resource.error() !== undefined);

  protected constructor(resourcePath: string) {
    this.baseUrl = `${environment.apiUrl}/${resourcePath}`;
  }

  byId(id: Uuid): TModel | undefined {
    return this.items().find((item) => item.id === id);
  }

  create(request: TRequest): Observable<TModel> {
    return this.http.post<TModel>(this.baseUrl, request).pipe(tap(() => this.reload()));
  }

  update(id: Uuid, request: TRequest): Observable<TModel> {
    return this.http.put<TModel>(`${this.baseUrl}/${id}`, request).pipe(tap(() => this.reload()));
  }

  remove(id: Uuid): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`).pipe(tap(() => this.reload()));
  }

  reload(): void {
    this.resource.reload();
  }
}
