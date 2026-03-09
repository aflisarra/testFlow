import {
    ApplicationConfig,
    importProvidersFrom,
    isDevMode,
    provideZoneChangeDetection
} from '@angular/core'
import {
    provideRouter,
    withInMemoryScrolling,
    type InMemoryScrollingFeature,
    type InMemoryScrollingOptions,
} from '@angular/router'

import { DecimalPipe } from '@angular/common'
import {
    HTTP_INTERCEPTORS,
    provideHttpClient,
    withFetch,
    withInterceptorsFromDi
} from '@angular/common/http'
import { BrowserModule } from '@angular/platform-browser'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { provideEffects } from '@ngrx/effects'
import { provideStore } from '@ngrx/store'
import { provideStoreDevtools } from '@ngrx/store-devtools'
import { provideToastr } from 'ngx-toastr'
import { routes } from './app.routes'
import { rootReducer } from './store'
import { AuthenticationEffects } from './store/authentication/authentication.effects'
import { CalendarEffects } from './store/calendar/calendar.effects'
import { localStorageSyncReducer } from './store/layout/layout-reducers'
import { AuthInterceptor } from './core/interceptors/auth.interceptor'

// scroll
const scrollConfig: InMemoryScrollingOptions = {
  scrollPositionRestoration: 'top',
  anchorScrolling: 'enabled',
}

const inMemoryScrollingFeatures: InMemoryScrollingFeature =
  withInMemoryScrolling(scrollConfig)

export const appConfig: ApplicationConfig = {
  providers: [
    // FakeBackendProvider, // Disabled: Using real backend
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, inMemoryScrollingFeatures),
    DecimalPipe,
    provideStore(rootReducer, { metaReducers: [localStorageSyncReducer] }),
    provideStoreDevtools({ maxAge: 25, logOnly: !isDevMode() }),
    provideEffects(AuthenticationEffects, CalendarEffects),
    provideHttpClient(withFetch(), withInterceptorsFromDi()),
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    importProvidersFrom(BrowserAnimationsModule, BrowserModule),
    provideToastr({}),
  ],
}
