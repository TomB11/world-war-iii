import { InjectionToken } from '@angular/core';
import { DATA_BASE_PATH } from '../constants/game.constants';

/**
 * Injection token so tests and future mod/scenario loading can override
 * where JSON game data is fetched from, without touching DataLoaderService.
 */
export const DATA_BASE_PATH_TOKEN = new InjectionToken<string>('DATA_BASE_PATH', {
  providedIn: 'root',
  factory: () => DATA_BASE_PATH,
});
