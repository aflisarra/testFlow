import {
    HttpBackend,
    HttpEvent,
    HttpHandler,
    HttpInterceptor,
    HttpRequest,
} from '@angular/common/http'
import { HttpClient, HttpContextToken, HttpErrorResponse } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { Router } from '@angular/router'
import { BehaviorSubject, EMPTY, Observable, throwError } from 'rxjs'
import { catchError, filter, finalize, switchMap, take } from 'rxjs/operators'
import { AuthenticationService } from '../services/auth.service'
import { ApiService } from '../services/api.service'

const REFRESH_RETRIED = new HttpContextToken<boolean>(() => false)

interface RefreshResponse {
  accessToken?: string
  token?: string
  refreshToken?: string
}

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private authService = inject(AuthenticationService)
  private router = inject(Router)
  private api = inject(ApiService)
  private http = new HttpClient(inject(HttpBackend)) // bypass interceptors

  private isRefreshing = false
  private refreshToken$ = new BehaviorSubject<string | null>(null)

  // Prefer "/api/auth/*" (used by AuthenticationService), but fall back for older backends.
  private readonly refreshPaths = ['/api/auth/refresh-token', '/refresh-token'] as const

  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    // Get token from auth service
    const token = this.authService.session

    // If token exists, add it to request headers
    if (token) {
      request = request.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      })
    }

    return next.handle(request).pipe(
      catchError((err: unknown) => {
        if (
          err instanceof HttpErrorResponse &&
          err.status === 401 &&
          !request.context.get(REFRESH_RETRIED) &&
          !this.isRefreshRequest(request)
        ) {
          return this.handle401(request, next)
        }

        return throwError(() => err)
      })
    )
  }

  /**
   * Input: the failed request + next handler.
   * Output: an Observable that retries the request once (or completes if session is cleared).
   * Purpose: silently refresh the access token on 401 and replay the original request.
   */
  private handle401(
    request: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    const refreshToken = this.authService.refreshToken

    if (!refreshToken) {
      this.clearAuthAndRedirect()
      return EMPTY
    }

    const requestOnce = request.clone({
      context: request.context.set(REFRESH_RETRIED, true),
    })

    if (this.isRefreshing) {
      return this.refreshToken$.pipe(
        filter((t): t is string => t !== null),
        take(1),
        switchMap((newAccessToken) =>
          newAccessToken
            ? next.handle(this.withAuth(requestOnce, newAccessToken))
            : EMPTY
        )
      )
    }

    this.isRefreshing = true
    this.refreshToken$.next(null)

    return this.refresh(refreshToken).pipe(
      switchMap((res) => {
        const newAccessToken = (res?.accessToken || res?.token || '').trim()
        if (!newAccessToken) throw new Error('Refresh returned no access token')

        this.authService.saveSession(newAccessToken)

        const maybeNewRefresh = (res?.refreshToken || '').trim()
        if (maybeNewRefresh) this.authService.saveRefreshToken(maybeNewRefresh)

        this.refreshToken$.next(newAccessToken)
        return next.handle(this.withAuth(requestOnce, newAccessToken))
      }),
      catchError(() => {
        this.clearAuthAndRedirect()
        return EMPTY
      }),
      finalize(() => {
        this.isRefreshing = false
      })
    )
  }

  /**
   * Input: refreshToken string.
   * Output: Observable of backend refresh response (new access token, optional refresh token).
   * Purpose: request a new access token without going through interceptors.
   */
  private refresh(refreshToken: string): Observable<RefreshResponse> {
    const primary = this.api.toAbsoluteUrl(this.refreshPaths[0])
    const fallback = this.api.toAbsoluteUrl(this.refreshPaths[1])

    return this.http.post<RefreshResponse>(primary, { refreshToken }).pipe(
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 404) {
          return this.http.post<RefreshResponse>(fallback, { refreshToken })
        }
        return throwError(() => err)
      })
    )
  }

  private withAuth(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
    return req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    })
  }

  private isRefreshRequest(req: HttpRequest<unknown>): boolean {
    const url = String(req.url || '')
    return this.refreshPaths.some((p) => url.includes(p))
  }

  private clearAuthAndRedirect(): void {
    this.isRefreshing = false
    this.refreshToken$.next('')
    this.authService.logout()
    void this.router.navigateByUrl('/auth/sign-in', { replaceUrl: true })
  }
}
