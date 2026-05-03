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

