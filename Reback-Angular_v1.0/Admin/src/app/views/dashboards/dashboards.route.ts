import { Route } from '@angular/router'
import { AnalyticsComponent } from './analytics/analytics.component'

export const DASHBOARD_ROUTES: Route[] = [
  {
    path: 'analytics',
    component: AnalyticsComponent,
    data: { title: 'Analytics' },
  },
]
