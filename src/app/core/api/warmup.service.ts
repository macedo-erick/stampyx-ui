import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import type { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { WarmupStatus } from '../../shared/models';

@Service()
export class WarmupService {
  private readonly http = inject(HttpClient);

  status(): Observable<WarmupStatus> {
    return this.http.get<WarmupStatus>(`${environment.apiUrl}/warmup`);
  }
}
