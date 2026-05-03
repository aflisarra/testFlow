import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { environment } from 'src/environments/environment'
import type { Observable } from 'rxjs'

import type { ApiOptions } from '@/app/interfaces/api.interface'
import type { Role } from '@/app/interfaces/role.interface'
import type { Status } from '@/app/interfaces/status.interface'
import type { UserAction } from '@/app/interfaces/user-action.interface'
import type { User } from '@/app/interfaces/user.interface'

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient)

  private readonly baseUrl = (environment.apiUrl || '').replace(/\/+$/, '')

  private buildUrl(pathOrUrl: string): string {
    const raw = String(pathOrUrl || '').trim()
    if (!raw) return this.baseUrl

    try {
      const u = new URL(raw)
      if (u.protocol === 'http:' || u.protocol === 'https:') return raw
    } catch {
      // Not an absolute URL; treat as relative path below.
    }

    if (!this.baseUrl) return raw
    if (raw.startsWith('/')) return `${this.baseUrl}${raw}`
    return `${this.baseUrl}/${raw}`
  }

  toAbsoluteUrl(pathOrUrl: string): string {
    return this.buildUrl(pathOrUrl)
  }

  get<T>(pathOrUrl: string, options: ApiOptions = {}): Observable<T> {
    return this.http.get<T>(this.buildUrl(pathOrUrl), options)
  }

  getBlob(pathOrUrl: string, options: ApiOptions = {}): Observable<Blob> {
    return this.http.get(this.buildUrl(pathOrUrl), { ...options, responseType: 'blob' as const })
  }

  post<T>(pathOrUrl: string, body: unknown, options: ApiOptions = {}): Observable<T> {
    return this.http.post<T>(this.buildUrl(pathOrUrl), body, options)
  }

  put<T>(pathOrUrl: string, body: unknown, options: ApiOptions = {}): Observable<T> {
    return this.http.put<T>(this.buildUrl(pathOrUrl), body, options)
  }

  patch<T>(pathOrUrl: string, body: unknown, options: ApiOptions = {}): Observable<T> {
    return this.http.patch<T>(this.buildUrl(pathOrUrl), body, options)
  }

  delete<T>(pathOrUrl: string, options: ApiOptions = {}): Observable<T> {
    return this.http.delete<T>(this.buildUrl(pathOrUrl), options)
  }

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(this.buildUrl('/users'))
  }

  getRoles(): Observable<Role[]> {
    return this.http.get<Role[]>(this.buildUrl('/roles'))
  }

  getStatus(): Observable<Status[]> {
    return this.http.get<Status[]>(this.buildUrl('/status'))
  }

  getUserActions(): Observable<UserAction[]> {
    return this.http.get<UserAction[]>(this.buildUrl('/actions'))
  }
}
