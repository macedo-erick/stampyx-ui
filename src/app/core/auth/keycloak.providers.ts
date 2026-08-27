import { EnvironmentProviders, Provider } from '@angular/core';
import {
  AutoRefreshTokenService,
  createInterceptorCondition,
  INCLUDE_BEARER_TOKEN_INTERCEPTOR_CONFIG,
  IncludeBearerTokenCondition,
  provideKeycloak,
  UserActivityService,
  withAutoRefreshToken,
} from 'keycloak-angular';

import { environment } from '../../../environments/environment';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const apiUrlCondition = createInterceptorCondition<IncludeBearerTokenCondition>({
  urlPattern: new RegExp(`^${escapeRegExp(environment.apiUrl)}(/.*)?$`, 'i'),
  bearerPrefix: 'Bearer',
});

export const provideKeycloakAuth = (): EnvironmentProviders =>
  provideKeycloak({
    config: {
      url: environment.keycloak.url,
      realm: environment.keycloak.realm,
      clientId: environment.keycloak.clientId,
    },
    initOptions: {
      onLoad: 'check-sso',
      pkceMethod: 'S256',
      silentCheckSsoRedirectUri: new URL('silent-check-sso.html', document.baseURI).href,
    },
    features: [
      withAutoRefreshToken({
        onInactivityTimeout: 'logout',
        sessionTimeout: 30 * 60 * 1000,
      }),
    ],
    providers: [AutoRefreshTokenService, UserActivityService],
  });

export const keycloakBearerTokenConfig: Provider = {
  provide: INCLUDE_BEARER_TOKEN_INTERCEPTOR_CONFIG,
  useValue: [apiUrlCondition],
};
