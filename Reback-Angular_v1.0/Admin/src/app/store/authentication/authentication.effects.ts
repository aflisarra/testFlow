import { Inject, Injectable } from '@angular/core'
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
  login$ = createEffect(() =>
    this.actions$.pipe(
      ofType(login),
      exhaustMap(({ email, password }) => {
        console.log('🔄 NgRx Effect login$ launched with:', { email, password });
        return this.AuthenticationService.login(email, password).pipe(
          filter((user) => {
            console.log('🔍 Filter - user is null?', user === null);
            return user !== null;
          }),
          map((user) => {
            console.log('✨ Login Success - user:', user);
            const returnUrl =
              this.route.snapshot.queryParams['returnUrl'] || '/'
            console.log('📍 Redirection vers:', returnUrl);
            this.router.navigateByUrl(returnUrl)
            return loginSuccess({ user: user! })
          }),
          catchError((error) => {
            console.error('❌ Erreur dans login effect:', error);
            const errorMessage = error.error?.error || error.message || 'Login failed';
            console.error('📝 Message d\'erreur:', errorMessage);
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
          this.toastr.error('Connection failed', '', { timeOut: 2500 })
        })
      ),
    { dispatch: false }
  )

  logout$ = createEffect(() =>
    this.actions$.pipe(
      ofType(logout),
      exhaustMap(() => {
        this.AuthenticationService.logout()
        this.router.navigate(['/auth/sign-in'])
        return of(logoutSuccess())
      })
    )
  )

  constructor(
    @Inject(Actions) private actions$: Actions,
    private AuthenticationService: AuthenticationService,
    private router: Router,
    private route: ActivatedRoute,
    private toastr: ToastrService
  ) { }
}
