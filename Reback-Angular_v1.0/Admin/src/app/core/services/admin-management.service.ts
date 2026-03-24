import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { Observable } from 'rxjs'

export interface AppUser {
  _id: string
  name: string
  email: string
  role: string
  roleId?: number
  description?: string
  picture?: string
}

export interface AppAction {
  _id: number
  name: string
  path: string
}

export interface AppRole {
  _id: number
  name: string
  description: string
  actions?: number[]
}

@Injectable({ providedIn: 'root' })
export class AdminManagementService {
  private http = inject(HttpClient)
  private readonly API_URL = 'http://localhost:3000/api'

  createUser(payload: {
    name: string
    email: string
    password: string
    role: string
    description?: string
    picture?: File | null
  }): Observable<{ message: string; user: AppUser }> {
    const formData = new FormData()
    formData.append('name', payload.name)
    formData.append('email', payload.email)
    formData.append('password', payload.password)
    formData.append('role', payload.role)
    if (payload.description) formData.append('description', payload.description)
    if (payload.picture) formData.append('picture', payload.picture)

    return this.http.post<{ message: string; user: AppUser }>(
      `${this.API_URL}/users/add`,
      formData
    )
  }

  getUsers(): Observable<AppUser[]> {
    return this.http.get<AppUser[]>(`${this.API_URL}/users`)
  }

  getUser(userId: string): Observable<AppUser> {
    return this.http.get<AppUser>(`${this.API_URL}/users/${userId}`)
  }

  updateUser(
    userId: string,
    payload: { name?: string; email?: string; role?: string; description?: string }
  ): Observable<{ message: string; user: AppUser }> {
    return this.http.put<{ message: string; user: AppUser }>(`${this.API_URL}/users/${userId}`, payload)
  }

  deleteUser(userId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.API_URL}/users/${userId}`)
  }

  getRoles(): Observable<AppRole[]> {
    return this.http.get<AppRole[]>(`${this.API_URL}/roles`)
  }

  getRole(roleId: number): Observable<AppRole> {
    return this.http.get<AppRole>(`${this.API_URL}/roles/${roleId}`)
  }

  createRole(payload: { name: string; description: string; actions: number[] }): Observable<AppRole> {
    return this.http.post<AppRole>(`${this.API_URL}/roles`, payload)
  }

  updateRole(
    roleId: number,
    payload: { name?: string; description?: string; actions?: number[] }
  ): Observable<{ message: string; role: AppRole }> {
    return this.http.put<{ message: string; role: AppRole }>(`${this.API_URL}/roles/${roleId}`, payload)
  }

  deleteRole(roleId: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.API_URL}/roles/${roleId}`)
  }

  getActions(): Observable<AppAction[]> {
    return this.http.get<AppAction[]>(`${this.API_URL}/actions`)
  }
}
