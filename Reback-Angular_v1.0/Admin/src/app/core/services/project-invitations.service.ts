import { Injectable, inject } from '@angular/core'
import { Observable } from 'rxjs'
import { ApiService } from '@/app/core/services/api.service'

import type { ProjectInvitationDto } from '@/app/interfaces/project-invitations.interface'

@Injectable({ providedIn: 'root' })
export class ProjectInvitationsService {
  private api = inject(ApiService)

  getMyPendingInvitations(): Observable<ProjectInvitationDto[]> {
    return this.api.get<ProjectInvitationDto[]>(`/api/project-invitations`)
  }

  acceptInvitation(invitationId: string): Observable<{ message: string; projectId?: string }> {
    return this.api.post<{ message: string; projectId?: string }>(`/api/project-invitations/${invitationId}/accept`, {})
  }

  ignoreInvitation(invitationId: string): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(`/api/project-invitations/${invitationId}/ignore`, {})
  }
}
