import { Route } from '@angular/router'
import { ProfileComponent } from './profile/profile.component'

export const PAGES_ROUTES: Route[] = [
  {
    path: 'profile',
    component: ProfileComponent,
    data: { title: 'Profile' },
  },
]
