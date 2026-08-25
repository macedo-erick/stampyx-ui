export interface Environment {
  readonly production: boolean;
  readonly apiUrl: string;
  readonly socketUrl: string;
  readonly keycloak: {
    readonly url: string;
    readonly realm: string;
    readonly clientId: string;
  };
  readonly primeNgLicense: string;
  readonly defaultLocale: string;
}
