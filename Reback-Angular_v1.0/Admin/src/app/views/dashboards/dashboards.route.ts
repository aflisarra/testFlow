import { Route } from '@angular/router'
import { AnalyticsComponent } from './analytics/analytics.component'
import { FinanceComponent } from './finance/finance.component'
import { SalesComponent } from './sales/sales.component'

export const DASHBOARD_ROUTES: Route[] = [
  {
    path: 'analytics',
    component: AnalyticsComponent,
    data: { title: 'Analytics' },
  },
  {
    path: 'finance',
    component: FinanceComponent,
    data: { title: 'Finance' },
  },
  {
    path: 'sales',
    component: SalesComponent,
    data: { title: 'Sales' },
  },
]
