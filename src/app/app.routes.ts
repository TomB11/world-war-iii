import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./screens/game-screen/game-screen.component').then((m) => m.GameScreenComponent),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
