import { requireAnyAction } from '@/app/core/guards/require-action.guard'
import { unsavedChangesGuard } from '@/app/core/guards/unsaved-changes.guard'
import { Route } from '@angular/router'
import { RolesManagementComponent } from './admin/roles/roles-management.component'
import { AllUsersComponent } from './admin/users/all-users.component'
import { InviteUserComponent } from './admin/users/invite-user.component'
import { ExecutionComponent } from './execution/Execution-Management/execution.component'
import { UnauthorizedComponent } from './pages/unauthorized/unauthorized.component'
import { ProjectManagementComponent } from './project/project-management.component'
import { TestCasesValidationComponent } from './test/list-test/list-test.component'
import { TestCasesHomeComponent } from './test/test-cases-home.component'
import { TestSuiteConfigurationComponent } from './test/test-plan.component'

export const VIEW_ROUTES: Route[] = [
  {
    path: 'unauthorized',
    component: UnauthorizedComponent,
    data: { title: 'Unauthorized' },
  },
  {
    path: 'dashboard',
    loadChildren: () =>
      import('./dashboards/dashboards.route').then(
        (mod) => mod.DASHBOARD_ROUTES
      ),
  },
  {
    path: 'admin/users',
    component: AllUsersComponent,
    canActivate: [requireAnyAction([2, 3, 4, 5, 10])],
    data: { title: 'Manage Users' },
  },
  {
    path: 'admin/users/invite',
    component: InviteUserComponent,
    canActivate: [requireAnyAction([2])],
    data: { title: 'Invite User' },
  },
  {
    path: 'admin/roles',
    component: RolesManagementComponent,
    canActivate: [requireAnyAction([6, 7, 8, 9, 17])],
    data: { title: 'Roles' },
  },
  {
    path: 'project',
    component: ProjectManagementComponent,
    canActivate: [requireAnyAction([11, 12, 13, 14, 15])],
    data: { title: 'Project Management' },
  },
  {
    path: 'test',
    component: TestSuiteConfigurationComponent,
    canDeactivate: [unsavedChangesGuard],
    data: { title: 'Test' },
  },
  {
    path: 'test-cases',
    component: TestCasesHomeComponent,
    canDeactivate: [unsavedChangesGuard],
    data: { title: 'Test Cases' },
  },
  {
    path: 'testcases',
    component: TestCasesHomeComponent,
    canDeactivate: [unsavedChangesGuard],
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
      import('./test/list-test/list-test.component')
        .then(m => m.TestCasesValidationComponent),
    data: { title: 'List of Tests' },
  },
  {
    path: 'execution/Execution-Management',
    component: ExecutionComponent,
    data: { title: 'Test Execution' },
  },
  {
    path: 'execution/:id',
    component: ExecutionComponent,
    data: { title: 'Test Execution' },
  },
]
