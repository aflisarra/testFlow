export interface AuthResponse {
  message: string
  token?: string
  accessToken?: string
  refreshToken?: string
  user: {
    id?: string
    _id?: string
    username?: string
    name?: string
    email: string
    picture?: string | null
    role?: string
    actions?: number[]
  }
}

export interface AuthUser {
  id: string
  username: string
  email: string
  token: string
  picture?: string | null
  role?: string
  actions?: number[]
}

export interface SignupRole {
  _id: number
  name: string
  description?: string
}
