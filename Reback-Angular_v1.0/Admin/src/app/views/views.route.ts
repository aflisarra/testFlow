import { Route } from '@angular/router'
import { WidgetsComponent } from './apps/widgets/widgets.component'
import { InvoiceDetailsComponent } from './invoices/invoice-details/invoice-details.component'
import { InvoicesComponent } from './invoices/invoices/invoices.component'
import { AllUsersComponent } from './admin/users/all-users.component'
import { InviteUserComponent } from './admin/users/invite-user.component'
import { RolesManagementComponent } from './admin/roles/roles-management.component'
import { TestSuiteConfigurationComponent } from './test/test-plan.component'
import { TestCasesValidationComponent } from './test/list-test.component'
import { TestCasesHomeComponent } from './test/test-cases-home.component'
import { ProjectManagementComponent } from './project/project-management.component'

export const VIEW_ROUTES: Route[] = [
  {
    path: 'pages',
    loadChildren: () =>
      import('./pages/pages.route').then((mod) => mod.PAGES_ROUTES),
  },
  {
    path: 'dashboard',
    loadChildren: () =>
      import('./dashboards/dashboards.route').then(
        (mod) => mod.DASHBOARD_ROUTES
      ),
  },
  {
    path: 'apps',
    loadChildren: () =>
      import('./apps/apps.route').then((mod) => mod.APPS_ROUTES),
  },
  {
    path: 'calendar',
    loadChildren: () =>
      import('./calendar/calendar.route').then((mod) => mod.CALENDAR_ROUTES),
  },
  {
    path: 'invoices',
    component: InvoicesComponent,
    data: { title: 'Invoices' },
  },
  {
    path: 'invoice/:id',
    component: InvoiceDetailsComponent,
    data: { title: 'Invoice Details' },
  },

  {
    path: 'widgets',
    component: WidgetsComponent,
    data: { title: 'Widgets' },
  },
  {
    path: 'admin/users',
    component: AllUsersComponent,
    data: { title: 'Manage Users' },
  },
  {
    path: 'admin/users/invite',
    component: InviteUserComponent,
    data: { title: 'Invite User' },
  },
  {
    path: 'admin/roles',
    component: RolesManagementComponent,
    data: { title: 'Roles' },
  },
  {
    path: 'project',
    component: ProjectManagementComponent,
    data: { title: 'Project Management' },
  },
  {
    path: 'ui',
    loadChildren: () => import('./ui/ui.route').then((mod) => mod.UI_ROUTES),
  },
  {
    path: 'advanced',
    loadChildren: () =>
      import('./advanced-ui/advanced.route').then((mod) => mod.ADVANCED_ROUTES),
  },
  {
    path: 'charts',
    loadChildren: () =>
      import('./charts/charts.route').then((mod) => mod.CHART_ROUTE),
  },
  {
    path: 'forms',
    loadChildren: () =>
      import('./forms/forms.route').then((mod) => mod.FOMRS_ROUTE),
  },
  {
    path: 'tables',
    loadChildren: () =>
      import('./tables/table.route').then((mod) => mod.TABLES_ROUTE),
  },
  {
    path: 'icons',
    loadChildren: () =>
      import('./icons/icons.route').then((mod) => mod.ICONS_ROUTES),
  },
  {
    path: 'maps',
    loadChildren: () => import('./map/map.route').then((mod) => mod.MAPS_ROUTE),
  },
  {
    path: 'test',
    component: TestSuiteConfigurationComponent,
    data: { title: 'Test' },
  },
  {
    path: 'test-cases',
    component: TestCasesHomeComponent,
    data: { title: 'Test Cases' },
  },
  {
    path: 'testcases',
    component: TestCasesHomeComponent,
    data: { title: 'Test Cases' },
  },
  {
    path: 'test-cases/:id',
    component: TestCasesValidationComponent,
    data: { title: 'Validation' },
  },
  {
    path: 'testcases/:id',
    component: TestCasesValidationComponent,
    data: { title: 'Validation' },
  },

  {
    path: 'test-suites',
    loadComponent: () =>
      import('./test/list-test.component')
        .then(m => m.TestCasesValidationComponent)
  },
]
