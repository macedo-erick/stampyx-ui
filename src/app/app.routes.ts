import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { Shell } from './layout/shell';

export const routes: Routes = [
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inbox' },
      {
        path: 'inbox',
        title: 'titles.inbox',
        loadComponent: () => import('./features/inbox/inbox-page').then((m) => m.InboxPage),
      },
      {
        path: 'domains',
        title: 'titles.domains',
        loadComponent: () => import('./features/domains/domains-page').then((m) => m.DomainsPage),
      },
      {
        path: 'domains/:id',
        title: 'titles.domain',
        loadComponent: () =>
          import('./features/domains/domain-detail-page').then((m) => m.DomainDetailPage),
      },
      {
        path: 'folders',
        title: 'titles.folders',
        loadComponent: () => import('./features/folders/folders-page').then((m) => m.FoldersPage),
      },
      {
        path: 'rules',
        title: 'titles.rules',
        loadComponent: () => import('./features/rules/rules-page').then((m) => m.RulesPage),
      },
      {
        path: 'admin',
        title: 'titles.admin',
        loadComponent: () => import('./features/admin/admin-page').then((m) => m.AdminPage),
      },
      {
        path: 'settings',
        title: 'titles.settings',
        loadComponent: () =>
          import('./features/settings/settings-page').then((m) => m.SettingsPage),
      },
    ],
  },
  {
    path: 'login',
    title: 'titles.login',
    loadComponent: () => import('./features/login/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'onboarding',
    title: 'titles.onboarding',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/onboarding/onboarding-page').then((m) => m.OnboardingPage),
  },
  {
    path: '**',
    title: 'titles.notFound',
    loadComponent: () => import('./features/not-found-page').then((m) => m.NotFoundPage),
  },
];
