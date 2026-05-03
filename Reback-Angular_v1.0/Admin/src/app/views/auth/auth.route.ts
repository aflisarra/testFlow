import { Route } from '@angular/router'
import { SigninComponent } from './signin/signin.component'
import { ResetPassComponent } from './reset-pass/reset-pass.component'

export const AUTH_ROUTES: Route[] = [
  {
    path: 'sign-in',
    component: SigninComponent,
    data: { title: 'Sign In' },
  },
  {
    path: 'reset-pass',
    component: ResetPassComponent,
    data: { title: 'Reset Password' },
  },
]
