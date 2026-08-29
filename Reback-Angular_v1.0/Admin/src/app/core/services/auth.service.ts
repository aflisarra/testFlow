import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs'
import { jwt_decode } from '@/app/core/utils/jwt-decode'
import { ApiService } from '@/app/core/services/api.service'
import type { AuthResponse, AuthUser, SignupRole } from '@/app/interfaces/auth.interface'

@Injectable({ providedIn: 'root' })
export class AuthenticationService {
  user: AuthUser | null = null;

  public readonly authSessionKey = 'token';
  public readonly refreshSessionKey = 'refreshToken'
  private api = inject(ApiService)

  // ✅ Login
  login(email: string, password: string) {
    return this.api.post<AuthResponse>(`/api/auth/signin`, { email, password }).pipe(
      map((response) => {
        const token = response?.accessToken || response?.token
        if (response && token) {
          const refreshToken = (response as AuthResponse & { refreshToken?: string })?.refreshToken
          let derivedId = ''
          try {
            const decoded = jwt_decode<Record<string, unknown>>(token)
            const userLike =
              (decoded?.['user'] as Record<string, unknown> | undefined) ?? decoded
            derivedId = String(
              (userLike?.['userId'] as string | number | undefined) ||
              (userLike?.['id'] as string | number | undefined) ||
              (userLike?.['_id'] as string | number | undefined) ||
              ''
            ).trim()
          } catch {
            derivedId = ''
          }

          this.user = {
            token,
            email: response.user.email,
            username: response.user.username || response.user.name || '',
            id: response.user.id || response.user._id || derivedId || '',
            picture: response.user.picture || null,
            role: response.user.role,
            actions: response.user.actions || [],
          };
          this.saveSession(token); // stocke le token dans le sessionStorage
          if (typeof window !== 'undefined') sessionStorage.removeItem('LAST_EXECUTION_STATE');
          if (typeof refreshToken === 'string' && refreshToken.trim()) {
            this.saveRefreshToken(refreshToken.trim())
          }
        }
        return this.user;
      })
    );
  }

  // ✅ Register
  register(
    username: string,
    email: string,
    password: string,
    confirmPassword: string,
    picture?: File,
    role?: string
  ) {
    const formData = new FormData();
    formData.append('name', username);
    formData.append('email', email);
    formData.append('password', password);
    formData.append('confirmPassword', confirmPassword);
    if (role) formData.append('role', role);
    if (picture) formData.append('picture', picture);

    return this.api.post<AuthResponse>(`/api/auth/signup`, formData).pipe(
      map((response) => {
        const token = response?.accessToken || response?.token
        if (response && token) {
          const refreshToken = (response as AuthResponse & { refreshToken?: string })?.refreshToken
          let derivedId = ''
          try {
            const decoded = jwt_decode<Record<string, unknown>>(token)
            const userLike =
              (decoded?.['user'] as Record<string, unknown> | undefined) ?? decoded
            derivedId = String(
              (userLike?.['userId'] as string | number | undefined) ||
              (userLike?.['id'] as string | number | undefined) ||
              (userLike?.['_id'] as string | number | undefined) ||
              ''
            ).trim()
          } catch {
            derivedId = ''
          }

          this.user = {
            token,
            email: response.user.email,
            username: response.user.username || response.user.name || '',
            id: response.user.id || response.user._id || derivedId || '',
            picture: response.user.picture || null,
            role: response.user.role,
            actions: response.user.actions || [],
          };
          this.saveSession(token);
          if (typeof window !== 'undefined') sessionStorage.removeItem('LAST_EXECUTION_STATE');
          if (typeof refreshToken === 'string' && refreshToken.trim()) {
            this.saveRefreshToken(refreshToken.trim())
          }
        }
        return this.user;
      })
    );
  }

  // ✅ Logout
  getSignupRoles(): Observable<SignupRole[]> {
    return this.api.get<SignupRole[]>(`/api/auth/signup-roles`)
  }

  logout(): void {
    this.removeSession();
    this.removeRefreshToken();
    if (typeof window !== 'undefined') sessionStorage.removeItem('LAST_EXECUTION_STATE');
    this.user = null;
  }

  // ✅ Récupérer le token depuis le sessionStorage
  get session(): string {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem(this.authSessionKey) || '';
  }

  /**
   * Input: access token string.
   * Output: void.
   * Purpose: persist the access token for authenticated API requests during session.
   */
  saveSession(token: string): void {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(this.authSessionKey, token);
    localStorage.removeItem(this.authSessionKey);
  }

  removeSession(): void {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(this.authSessionKey);
    localStorage.removeItem(this.authSessionKey);
  }

  get refreshToken(): string {
    if (typeof window === 'undefined') return ''
    return sessionStorage.getItem(this.refreshSessionKey) || ''
  }

  /**
   * Input: refresh token string.
   * Output: void.
   * Purpose: persist the refresh token used to renew the access token silently during session.
   */
  saveRefreshToken(token: string): void {
    if (typeof window === 'undefined') return
    sessionStorage.setItem(this.refreshSessionKey, token)
    localStorage.removeItem(this.refreshSessionKey)
  }

  removeRefreshToken(): void {
    if (typeof window === 'undefined') return
    sessionStorage.removeItem(this.refreshSessionKey)
    localStorage.removeItem(this.refreshSessionKey)
  }

  get decodedToken(): Record<string, unknown> | null {
    const token = this.session;
    if (!token) return null;
    try {
      return jwt_decode<Record<string, unknown>>(token);
    } catch {
      return null;
    }
  }

  get currentUserName(): string | null {
    const decoded = this.decodedToken;
    if (!decoded) return null;

    const userLike =
      (decoded['user'] as Record<string, unknown> | undefined) ?? decoded;

    const username =
      (userLike['username'] as string | undefined) ||
      (userLike['name'] as string | undefined) ||
      (userLike['email'] as string | undefined);

    return username?.trim() || null;
  }

  get currentUserPicture(): string | null {
    const decoded = this.decodedToken
    if (!decoded) return null

    const userLike =
      (decoded['user'] as Record<string, unknown> | undefined) ?? decoded

    const picture = userLike['picture'] as string | undefined
    return picture?.trim() || null
  }

  // ── reset password ──
  forgotPassword(email: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(`/auth/forgot-password`, { email });
  }

  verifyMagicToken(token: string): Observable<{ resetToken: string; valid: boolean }> {
    return this.api.post<{ resetToken: string; valid: boolean }>(`/auth/verify-magic-token`, { token });
  }

  verifyOtp(email: string, code: string): Observable<{ resetToken: string; valid: boolean }> {
    return this.api.post<{ resetToken: string; valid: boolean }>(`/auth/verify-otp`, { email, code });
  }

  resetPassword(resetToken: string, password: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(`/auth/reset-password`, { resetToken, password });
  }
  changePassword(currentPassword: string, newPassword: string) {
  return this.api.post<{ message: string }>(
    `api/auth/change-password`,
    { currentPassword, newPassword }
  )
}
}
