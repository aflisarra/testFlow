import { Injectable, inject } from '@angular/core'
import { Observable } from 'rxjs'
import { ApiService } from '@/app/core/services/api.service'

@Injectable({
  providedIn: 'root',
})
export class AuthMagicService {
  private api = inject(ApiService)

  forgotPassword(email: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(`/auth/forgot-password`, { email })
  }

  verifyMagicToken(token: string): Observable<{ resetToken: string; valid: boolean }> {
    return this.api.post<{ resetToken: string; valid: boolean }>(`/auth/verify-magic-token`, { token })
  }

  verifyOtp(email: string, code: string): Observable<{ resetToken: string; valid: boolean }> {
    return this.api.post<{ resetToken: string; valid: boolean }>(`/auth/verify-otp`, { email, code })
  }

  resetPassword(resetToken: string, password: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(`/auth/reset-password`, { resetToken, password })
  }
}
