import { Injectable, inject } from '@angular/core'
import { Observable, map } from 'rxjs'
import { ApiService } from '@/app/core/services/api.service'

import type {
  AppAction,
  AppProject,
  AppRole,
  AppUser,
  CurrentUserProfileResponse,
} from '@/app/interfaces/admin-management.interface'

@Injectable({ providedIn: 'root' })
export class AdminManagementService {
  private api = inject(ApiService)

private normalizeMongoId(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)

  if (value && typeof value === 'object') {
    const maybeOid = (value as { $oid?: unknown }).$oid
    if (typeof maybeOid === 'string') return maybeOid.trim()

    const str = (value as { toString?: () => unknown }).toString?.()
    if (typeof str === 'string' && str !== '[object Object]') return str.trim()
  }

  return ''
}

private normalizeRole(raw: unknown): AppRole {
  const r = raw as {
    _id?: unknown
    id?: unknown
    roleId?: unknown
    name?: unknown
    description?: unknown
    actions?: unknown
  }

  const id = this.normalizeMongoId(r._id || r.id || r.roleId)

  const actionsRaw = Array.isArray(r.actions) ? r.actions : []
  const actions = actionsRaw
    .map((v: unknown) => Number(v))
    .filter((n: number) => Number.isFinite(n))

  return {
    _id: id,
    name: String(r.name || '').trim(),
    description: String(r.description || '').trim(),
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

    return this.api.post<{ message: string; user: AppUser }>(`/api/users/add`, formData)
  }

  getUsers(): Observable<AppUser[]> {
    return this.api.get<AppUser[]>(`/api/users`)
  }

  getUser(userId: string): Observable<AppUser> {
    return this.api.get<AppUser>(`/api/users/${userId}`)
  }

  getCurrentUserProfile(): Observable<CurrentUserProfileResponse> {
    return this.api.get<CurrentUserProfileResponse>(`/api/users/profile`)
  }

  updateUser(
    userId: string,
    payload: { name?: string; email?: string; role?: string; description?: string }
  ): Observable<{ message: string; user: AppUser }> {
    return this.api.put<{ message: string; user: AppUser }>(`/api/users/${userId}`, payload)
  }

  deleteUser(userId: string): Observable<{ message: string }> {
    return this.api.delete<{ message: string }>(`/api/users/${userId}`)
  }

  getRoles(): Observable<AppRole[]> {
    return this.api.get<unknown>(`/api/roles`).pipe(map((roles) => this.normalizeRoles(roles)))
  }

  getRole(roleId: string): Observable<AppRole> {
    return this.api.get<unknown>(`/api/roles/${roleId}`).pipe(map((role) => this.normalizeRole(role)))
  }

  createRole(payload: { name: string; description: string; actions: number[] }): Observable<AppRole> {
    return this.api.post<unknown>(`/api/roles`, payload).pipe(map((role) => this.normalizeRole(role)))
  }

  updateRole(
    roleId: string,
    payload: { name?: string; description?: string; actions?: number[] }
  ): Observable<{ message: string; role: AppRole }> {
    return this.api
      .put<{ message: string; role: unknown }>(`/api/roles/${roleId}`, payload)
      .pipe(
  map((resp) => ({
    ...resp,
    role: this.normalizeRole(resp.role),
  }))
)
  }

  deleteRole(roleId: string): Observable<{ message: string }> {
    return this.api.delete<{ message: string }>(`/api/roles/${roleId}`)
  }

  getActions(): Observable<AppAction[]> {
    return this.api.get<AppAction[]>(`/api/actions`)
  }

  getProjects(mine = false): Observable<AppProject[]> {
    return this.api.get<AppProject[]>(`/api/projects`, {
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
    return this.api.post<{ message: string; project: AppProject }>(`/api/projects`, payload)
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
    return this.api.put<{ message: string; project: AppProject }>(`/api/projects/${projectId}`, payload)
  }

  assignUsersToProject(
    projectId: string,
    assignedUsers: string[]
  ): Observable<{ message: string; project: AppProject }> {
    return this.api.patch<{ message: string; project: AppProject }>(`/api/projects/${projectId}/users`, {
      assignedUsers,
    })
  }

  deleteProject(projectId: string): Observable<{ message: string }> {
    return this.api.delete<{ message: string }>(`/api/projects/${projectId}`)
  }
}
