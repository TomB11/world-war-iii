import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./screens/main-menu/main-menu.component').then((m) => m.MainMenuComponent),
  },
  {
    path: 'choose-side',
    loadComponent: () =>
      import('./screens/choose-side/choose-side.component').then((m) => m.ChooseSideComponent),
  },
  {
    path: 'game',
    loadComponent: () =>
      import('./screens/game-screen/game-screen.component').then((m) => m.GameScreenComponent),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
