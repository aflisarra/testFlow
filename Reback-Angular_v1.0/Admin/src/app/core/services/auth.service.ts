import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs/operators';
import { CookieService } from 'ngx-cookie-service';

interface AuthResponse {
  message: string;
  token?: string;
  accessToken?: string;
  user: {
    id?: string;
    _id?: string;
    username?: string;
    name?: string;
    email: string;
    role?: string;
    actions?: number[];
  };
}

export interface User {
  id: string;
  username: string;
  email: string;
  token: string;
  role?: string;
  actions?: number[];
}

@Injectable({ providedIn: 'root' })
export class AuthenticationService {
  user: User | null = null;

  public readonly authSessionKey = '_REBACK_AUTH_SESSION_KEY_';
  private cookieService = inject(CookieService);
  private readonly API_URL = 'http://localhost:3000/api/auth'; // doit pointer sur ton backend

  // eslint-disable-next-line @angular-eslint/prefer-inject
  constructor(private http: HttpClient) {}

  // ✅ Login
  login(email: string, password: string) {
    return this.http.post<AuthResponse>(`${this.API_URL}/signin`, { email, password }).pipe(
      map((response) => {
        const token = response?.accessToken || response?.token
        if (response && token) {
          this.user = {
            token,
            email: response.user.email,
            username: response.user.username || response.user.name || '',
            id: response.user.id || response.user._id || '',
            role: response.user.role,
            actions: response.user.actions || [],
          };
          this.saveSession(token); // stocke le token dans les cookies
        }
        return this.user;
      })
    );
  }

  // ✅ Register
  register(username: string, email: string, password: string, confirmPassword: string, picture?: File) {
    const formData = new FormData();
    formData.append('name', username);
    formData.append('email', email);
    formData.append('password', password);
    formData.append('confirmPassword', confirmPassword);
    if (picture) formData.append('picture', picture);

    return this.http.post<AuthResponse>(`${this.API_URL}/signup`, formData).pipe(
      map((response) => {
        const token = response?.accessToken || response?.token
        if (response && token) {
          this.user = {
            token,
            email: response.user.email,
            username: response.user.username || response.user.name || '',
            id: response.user.id || response.user._id || '',
            role: response.user.role,
            actions: response.user.actions || [],
          };
          this.saveSession(token);
        }
        return this.user;
      })
    );
  }

  // ✅ Logout
  logout(): void {
    this.removeSession();
    this.user = null;
  }

  // ✅ Récupérer le token depuis les cookies
  get session(): string {
    return this.cookieService.get(this.authSessionKey);
  }

  saveSession(token: string): void {
    this.cookieService.set(this.authSessionKey, token);
  }

  removeSession(): void {
    this.cookieService.delete(this.authSessionKey);
  }
}
