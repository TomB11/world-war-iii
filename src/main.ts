import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app/app.component';

bootstrapApplication(AppComponent, appConfig).catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Failed to bootstrap World War III', error);
});
