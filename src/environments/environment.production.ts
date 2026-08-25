import type { Environment } from './environment.model';

export const environment: Environment = {
  production: true,
  apiUrl: 'https://stampyx.com/api',
  socketUrl: 'https://stampyx.com',
  keycloak: {
    url: 'https://stampyx.com/auth',
    realm: 'stampyx',
    clientId: 'stampyx-ui',
  },
  primeNgLicense:
    'eyJpZCI6ImE0MmJjNTAyLWY4OTUtNGVmNi05ZTczLTFlOTc3ODYxN2E5YyIsInByb2R1Y3QiOiJwcmltZXVpIiwidGllciI6ImNvbW11bml0eSIsInR5cGUiOiJkZXYiLCJpYXQiOjE3ODU4MDY5MDYsImV4cCI6MTgxNzM0MjkwNn0.T5cOipxcy6E1I8jTBQaa3v3073YOytbhr2FkKKqV7HJOghFd6VCnItsxdXVkaFIbHP3V3i4iy-11eVMD0cZ0Bw',
  defaultLocale: 'pt-BR',
};
