import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthMagicService {
  private readonly apiOrigin = 'http://localhost:3000';

  constructor(private http: HttpClient) {}

  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiOrigin}/auth/forgot-password`, { email });
  }

  verifyMagicToken(token: string): Observable<{ resetToken: string; valid: boolean }> {
    return this.http.post<{ resetToken: string; valid: boolean }>(
      `${this.apiOrigin}/auth/verify-magic-token`,
      { token }
    );
  }

  verifyOtp(email: string, code: string): Observable<{ resetToken: string; valid: boolean }> {
    return this.http.post<{ resetToken: string; valid: boolean }>(
      `${this.apiOrigin}/auth/verify-otp`,
      { email, code }
    );
  }

  resetPassword(resetToken: string, password: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.apiOrigin}/auth/reset-password`,
      { resetToken, password }
    );
  }
}
