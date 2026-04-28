import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { Observable, map } from 'rxjs'

export interface AppUser {
  _id: string
  name: string
  email: string
  role: string
  roleId?: number
  description?: string
  picture?: string
}

export interface CurrentUserProfileResponse {
  user: AppUser
  actions: number[]
}

export interface AppAction {
  _id: number
  name: string
  path: string
}

export interface AppRole {
  _id: string
  name: string
  description: string
  actions?: number[]
}

export interface AppProject {
  _id: string
  title: string
  description?: string
  startDate?: string | null
  endDate?: string | null
  milestoneDate?: string | null
  status: 'draft' | 'active' | 'paused' | 'completed'
  ownerId?: AppUser | string
  assignedUsers?: AppUser[]
  createdAt?: string
  updatedAt?: string
}

@Injectable({ providedIn: 'root' })
export class AdminManagementService {
  private http = inject(HttpClient)
  private readonly API_URL = 'http://localhost:3000/api'

  private normalizeMongoId(value: unknown): string {
    if (typeof value === 'string') return value.trim()
    if (typeof value === 'number') return String(value)
    if (value && typeof value === 'object') {
      const maybeOid = (value as any)?.$oid
      if (typeof maybeOid === 'string') return maybeOid.trim()
      const str = (value as any)?.toString?.()
      if (typeof str === 'string' && str !== '[object Object]') return str.trim()
    }
    return ''
  }

  private normalizeRole(raw: any): AppRole {
    const id = this.normalizeMongoId(raw?._id || raw?.id || raw?.roleId)
    const actionsRaw = Array.isArray(raw?.actions) ? raw.actions : []
    const actions = actionsRaw
      .map((v: unknown) => Number(v))
      .filter((n: number) => Number.isFinite(n))

    return {
      _id: id,
      name: String(raw?.name || '').trim(),
      description: String(raw?.description || '').trim(),
      actions,
    }
  }

  private normalizeRoles(raw: unknown): AppRole[] {
    if (!Array.isArray(raw)) return []
    return raw.map((r) => this.normalizeRole(r))
  }

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

  getCurrentUserProfile(): Observable<CurrentUserProfileResponse> {
    return this.http.get<CurrentUserProfileResponse>(`${this.API_URL}/users/profile`)
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
    return this.http.get<unknown>(`${this.API_URL}/roles`).pipe(map((roles) => this.normalizeRoles(roles)))
  }

  getRole(roleId: string): Observable<AppRole> {
    return this.http.get<unknown>(`${this.API_URL}/roles/${roleId}`).pipe(map((role) => this.normalizeRole(role)))
  }

  createRole(payload: { name: string; description: string; actions: number[] }): Observable<AppRole> {
    return this.http
      .post<unknown>(`${this.API_URL}/roles`, payload)
      .pipe(map((role) => this.normalizeRole(role)))
  }

  updateRole(
    roleId: string,
    payload: { name?: string; description?: string; actions?: number[] }
  ): Observable<{ message: string; role: AppRole }> {
    return this.http
      .put<{ message: string; role: unknown }>(`${this.API_URL}/roles/${roleId}`, payload)
      .pipe(
        map((resp) => ({
          ...resp,
          role: this.normalizeRole((resp as any)?.role),
        }))
      )
  }

  deleteRole(roleId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.API_URL}/roles/${roleId}`)
  }

  getActions(): Observable<AppAction[]> {
    return this.http.get<AppAction[]>(`${this.API_URL}/actions`)
  }

  getProjects(mine = false): Observable<AppProject[]> {
    return this.http.get<AppProject[]>(`${this.API_URL}/projects`, {
      params: { mine: String(mine) },
    })
  }

  createProject(payload: {
    title: string
    description?: string
    startDate?: string | null
    endDate?: string | null
    milestoneDate?: string | null
    status?: 'draft' | 'active' | 'paused' | 'completed'
    assignedUsers?: string[]
  }): Observable<{ message: string; project: AppProject }> {
    return this.http.post<{ message: string; project: AppProject }>(`${this.API_URL}/projects`, payload)
  }

  updateProject(
    projectId: string,
    payload: {
      title?: string
      description?: string
      startDate?: string | null
      endDate?: string | null
      milestoneDate?: string | null
      status?: 'draft' | 'active' | 'paused' | 'completed'
      assignedUsers?: string[]
    }
  ): Observable<{ message: string; project: AppProject }> {
    return this.http.put<{ message: string; project: AppProject }>(`${this.API_URL}/projects/${projectId}`, payload)
  }

  assignUsersToProject(
    projectId: string,
    assignedUsers: string[]
  ): Observable<{ message: string; project: AppProject }> {
    return this.http.patch<{ message: string; project: AppProject }>(`${this.API_URL}/projects/${projectId}/users`, {
      assignedUsers,
    })
  }

  deleteProject(projectId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.API_URL}/projects/${projectId}`)
  }
}
