import { Routes } from '@angular/router';
import { LobbyComponent } from './lobby/lobby';
import { GameComponent } from './game/game';

export const routes: Routes = [
  { path: '', component: LobbyComponent },
  { path: 'room/:code', component: GameComponent },
  { path: '**', redirectTo: '' },
];
