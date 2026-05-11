import { HttpBackend } from '@angular/common/http'
import { HttpClient } from '@angular/common/http'
import { Injectable, OnDestroy, inject } from '@angular/core'
import { Router } from '@angular/router'
import { Subscription, firstValueFrom, throwError, timer } from 'rxjs'
import { catchError } from 'rxjs/operators'
import { jwt_decode } from '@/app/core/utils/jwt-decode'
import { ApiService } from '@/app/core/services/api.service'
import { AuthenticationService } from '@/app/core/services/auth.service'

interface RefreshResponse {
  accessToken?: string
  token?: string
  refreshToken?: string
}

@Injectable({ providedIn: 'root' })
export class AuthSessionMonitorService implements OnDestroy {
  private auth = inject(AuthenticationService)
  private api = inject(ApiService)
  private router = inject(Router)
  private http = new HttpClient(inject(HttpBackend)) // bypass interceptors

  private expirySub: Subscription | null = null
  private readonly refreshPaths = ['/api/auth/refresh-token', '/refresh-token'] as const

  start(): void {
    this.scheduleFromCurrentToken()
  }

  ngOnDestroy(): void {
    this.expirySub?.unsubscribe()
    this.expirySub = null
  }

  private scheduleFromCurrentToken(): void {
    this.expirySub?.unsubscribe()
    this.expirySub = null

    const token = this.auth.session
    if (!token) return

    const expMs = this.getTokenExpiryMs(token)
    if (!expMs) return

    const now = Date.now()
    const dueInMs = expMs - now

    if (dueInMs <= 0) {
      void this.handleExpired()
      return
    }

    // Wake up slightly before expiry to refresh silently if possible.
    const wakeInMs = Math.max(0, dueInMs - 10_000)
    this.expirySub = timer(wakeInMs).subscribe(() => void this.handleExpired())
  }

  private async handleExpired(): Promise<void> {
    const refreshToken = this.auth.refreshToken
    if (!refreshToken) {
      this.forceLogout()
      return
    }

    try {
      const res = await firstValueFrom(
        this.refresh(refreshToken)
      )

      const newAccessToken = (res?.accessToken || res?.token || '').trim()
      if (!newAccessToken) throw new Error('Refresh returned no access token')

      this.auth.saveSession(newAccessToken)

      const maybeNewRefresh = (res?.refreshToken || '').trim()
      if (maybeNewRefresh) this.auth.saveRefreshToken(maybeNewRefresh)

      this.scheduleFromCurrentToken()
    } catch {
      this.forceLogout()
    }
  }

  private forceLogout(): void {
    this.auth.logout()
    void this.router.navigateByUrl('/auth/sign-in', { replaceUrl: true })
  }

  private refresh(refreshToken: string) {
    const primary = this.api.toAbsoluteUrl(this.refreshPaths[0])
    const fallback = this.api.toAbsoluteUrl(this.refreshPaths[1])

    return this.http.post<RefreshResponse>(primary, { refreshToken }).pipe(
      catchError((err: unknown) => {
        // Older backends might expose "/refresh-token" at the root.
        const status = (err as { status?: unknown } | null)?.status
        if (status === 404) return this.http.post<RefreshResponse>(fallback, { refreshToken })
        return throwError(() => err)
      })
    )
  }

  private getTokenExpiryMs(token: string): number | null {
    try {
      const decoded = jwt_decode<Record<string, unknown>>(token)
      const exp = decoded?.['exp']
      const expSeconds = typeof exp === 'number' ? exp : Number(exp)
      if (!Number.isFinite(expSeconds) || expSeconds <= 0) return null
      return Math.floor(expSeconds * 1000)
    } catch {
      return null
    }
  }
}
