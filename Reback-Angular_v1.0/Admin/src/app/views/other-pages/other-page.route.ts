import { Route } from '@angular/router'
import { ComingsoonComponent } from './comingsoon/comingsoon.component'
import { Error4042Component } from './error-404-2/error-404-2.component'
import { Error404Component } from './error-404/error-404.component'
import { MaintenanceComponent } from './maintenance/maintenance.component'

export const OTHER_PAGES_ROUTES: Route[] = [
  {
    path: 'coming-soon',
    component: ComingsoonComponent,
    data: { title: 'Coming Soon' },
  },
  {
    path: 'maintenance',
    component: MaintenanceComponent,
    data: { title: 'Maintenance' },
  },
  {
    path: 'error-404',
    component: Error404Component,
    data: { title: 'Page Not Found - 404' },
  },
  {
    path: 'error-404-2',
    component: Error4042Component,
    data: { title: 'Page Not Found - 404' },
  },
]
