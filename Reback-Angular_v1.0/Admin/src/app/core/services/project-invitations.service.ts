import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { Observable } from 'rxjs'

export interface ProjectInviteUserLite {
  _id: string
  name?: string
  email?: string
  picture?: string | null
}

export interface ProjectInviteProjectLite {
  _id: string
  title: string
  description?: string
  status?: string
}

export interface ProjectInvitationDto {
  _id: string
  projectId: ProjectInviteProjectLite
  userId: string
  invitedBy: ProjectInviteUserLite
  status: 'pending' | 'accepted' | 'ignored' | 'revoked'
  createdAt?: string
}

@Injectable({ providedIn: 'root' })
export class ProjectInvitationsService {
  private http = inject(HttpClient)
  private baseUrl = 'http://localhost:3000/api'

  getMyPendingInvitations(): Observable<ProjectInvitationDto[]> {
    return this.http.get<ProjectInvitationDto[]>(
      `${this.baseUrl}/project-invitations`
    )
  }

  acceptInvitation(invitationId: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.baseUrl}/project-invitations/${invitationId}/accept`,
      {}
    )
  }

  ignoreInvitation(invitationId: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.baseUrl}/project-invitations/${invitationId}/ignore`,
      {}
    )
  }
}

