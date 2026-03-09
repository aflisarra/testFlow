import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { Observable } from 'rxjs'

export interface AppUser {
  _id: string
  name: string
  email: string
  role: string
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

  getUsers(): Observable<AppUser[]> {
    return this.http.get<AppUser[]>(`${this.API_URL}/users`)
  }

  getRoles(): Observable<AppRole[]> {
    return this.http.get<AppRole[]>(`${this.API_URL}/roles`)
  }

  createRole(payload: { name: string; description: string; actions: number[] }): Observable<AppRole> {
    return this.http.post<AppRole>(`${this.API_URL}/roles`, payload)
  }

  getActions(): Observable<AppAction[]> {
    return this.http.get<AppAction[]>(`${this.API_URL}/actions`)
  }
}
