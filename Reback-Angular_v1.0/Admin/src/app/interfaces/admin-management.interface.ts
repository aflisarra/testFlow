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

