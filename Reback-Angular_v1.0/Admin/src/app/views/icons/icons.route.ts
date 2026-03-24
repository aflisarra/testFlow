import type { Route } from '@angular/router'
import { BoxiconsComponent } from './boxicons/boxicons.component'
import { IconamoonComponent } from './iconamoon/iconamoon.component'

export const ICONS_ROUTES: Route[] = [
  {
    path: 'boxicons',
    component: BoxiconsComponent,
    data: { title: 'Boxicons' },
  },
  {
    path: 'iconamoon',
    component: IconamoonComponent,
    data: { title: 'IconaMoon' },
  },
]
