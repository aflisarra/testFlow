import { provideHttpClient } from '@angular/common/http'
import { provideHttpClientTesting } from '@angular/common/http/testing'
import { provideRouter } from '@angular/router'
import { NgbActiveOffcanvas } from '@ng-bootstrap/ng-bootstrap'
import { provideMockStore } from '@ngrx/store/testing'
import { ToastrService } from 'ngx-toastr'

const initialState = {
  authentication: {
    error: null,
    isLoggedIn: false,
    user: null,
  },
  layout: {
    LAYOUT_THEME: 'light',
    MENU_COLOR: 'light',
    MENU_SIZE: 'default',
    TOPBAR_COLOR: 'light',
  },
}

export function appTestProviders() {
  return [
    provideRouter([]),
    provideHttpClient(),
    provideHttpClientTesting(),
    ...provideMockStore({ initialState }),
    {
      provide: NgbActiveOffcanvas,
      useValue: {
        close: () => undefined,
        dismiss: () => undefined,
      },
    },
    {
      provide: ToastrService,
      useValue: {
        error: () => undefined,
        info: () => undefined,
        success: () => undefined,
        warning: () => undefined,
      },
    },
  ]
}
