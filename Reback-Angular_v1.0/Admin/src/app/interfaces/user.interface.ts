import type { Role } from './role.interface'
import type { Status } from './status.interface'

export interface User {
  id: number
  name: string
  email: string
  role: Role
  status: Status
}

