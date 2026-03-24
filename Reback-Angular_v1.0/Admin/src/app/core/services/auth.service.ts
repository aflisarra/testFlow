import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs'
import { jwt_decode } from '@/app/core/utils/jwt-decode'

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
    picture?: string | null;
    role?: string;
    actions?: number[];
  };
}

export interface User {
  id: string;
  username: string;
  email: string;
  token: string;
  picture?: string | null;
  role?: string;
  actions?: number[];
}

export interface SignupRole {
  _id: number
  name: string
  description?: string
}

@Injectable({ providedIn: 'root' })
export class AuthenticationService {
  user: User | null = null;

  public readonly authSessionKey = 'token';
  private readonly API_URL = 'http://localhost:3000/api/auth'; // doit pointer sur ton backend

  // eslint-disable-next-line @angular-eslint/prefer-inject
  constructor(private http: HttpClient) {}

  // ✅ Login
  login(email: string, password: string) {
    return this.http.post<AuthResponse>(`${this.API_URL}/signin`, { email, password }).pipe(
      map((response) => {
        const token = response?.accessToken || response?.token
        if (response && token) {
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
          this.saveSession(token); // stocke le token dans le localStorage
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

    return this.http.post<AuthResponse>(`${this.API_URL}/signup`, formData).pipe(
      map((response) => {
        const token = response?.accessToken || response?.token
        if (response && token) {
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
        }
        return this.user;
      })
    );
  }

  // ✅ Logout
  getSignupRoles(): Observable<SignupRole[]> {
    return this.http.get<SignupRole[]>(`${this.API_URL}/signup-roles`)
  }

  logout(): void {
    this.removeSession();
    this.user = null;
  }

  // ✅ Récupérer le token depuis le localStorage
  get session(): string {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(this.authSessionKey) || '';
  }

  saveSession(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.authSessionKey, token);
  }

  removeSession(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.authSessionKey);
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
}
