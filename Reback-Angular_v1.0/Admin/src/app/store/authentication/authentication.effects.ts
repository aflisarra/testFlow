import { Injectable, inject } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { Actions, createEffect, ofType } from '@ngrx/effects'
import { ToastrService } from 'ngx-toastr'
import { of } from 'rxjs'
import { catchError, exhaustMap, map, filter, tap } from 'rxjs/operators'
import {
  login,
  loginFailure,
  loginSuccess,
  logout,
  logoutSuccess,
} from './authentication.actions'
import { AuthenticationService } from '@/app/core/services/auth.service'

@Injectable()
export class AuthenticationEffects {
  private actions$ = inject(Actions)
  private authenticationService = inject(AuthenticationService)
  private router = inject(Router)
  private route = inject(ActivatedRoute)
  private toastr = inject(ToastrService)

  login$ = createEffect(() =>
    this.actions$.pipe(
      ofType(login),
      exhaustMap(({ email, password }) => {
        return this.authenticationService.login(email, password).pipe(
          filter((user) => {
            return user !== null;
          }),
          map((user) => {
            const returnUrl =
              this.route.snapshot.queryParams['returnUrl'] || '/'
            this.router.navigateByUrl(returnUrl)
            return loginSuccess({ user: user! })
          }),
          catchError((error) => {
            const errorMessage = error.error?.error || error.message || 'Login failed';
            return of(loginFailure({ error: errorMessage }))
          })
        )
      })
    )
  )

  loginFailureToast$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(loginFailure),
        tap(() => {
          this.toastr.error('login/password incorrect', '', { timeOut: 2500 })
        })
      ),
    { dispatch: false }
  )

  logout$ = createEffect(() =>
    this.actions$.pipe(
      ofType(logout),
      exhaustMap(() => {
        this.authenticationService.logout()
        this.router.navigate(['/auth/sign-in'])
        return of(logoutSuccess())
      })
    )
  )

}
