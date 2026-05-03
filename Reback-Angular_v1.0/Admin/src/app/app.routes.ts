import { RedirectCommand, Router, Routes, type UrlTree } from '@angular/router'
import { AuthLayoutComponent } from './layouts/auth-layout/auth-layout.component'
import { PrivateLayoutComponent } from './layouts/private-layout/private-layout.component'
import { AuthenticationService } from './core/services/auth.service'
//import { TestCasesHomeComponent } from './views/test/test-cases-home.component'
import { inject } from '@angular/core'

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard/analytics',
    pathMatch: 'full',
  },
  {
    path: '',
    component: PrivateLayoutComponent,
    canActivate: [
      () => {
        const currentUser = inject(AuthenticationService).session
        const router: Router = inject(Router)
        if (currentUser) return true
        const urlTree: UrlTree = router.parseUrl('/auth/sign-in')
        return new RedirectCommand(urlTree, { skipLocationChange: true })
      },
    ],
    loadChildren: () =>
      import('./views/views.route').then((mod) => mod.VIEW_ROUTES),
  },
  {
    path: 'auth',
    component: AuthLayoutComponent,
    loadChildren: () =>
      import('./views/auth/auth.route').then((mod) => mod.AUTH_ROUTES),
  },
  /*{
    path: 'test-suites',
    loadComponent: () =>
      import('./views/test/test-cases-home.component')
        .then(m => m.TestCasesHomeComponent)
  }*/
]
