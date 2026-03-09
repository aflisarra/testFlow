import type { Route } from '@angular/router'
import { BasicComponent } from './basic/basic.component'
import { DatatableComponent } from './datatable/datatable.component'

export const TABLES_ROUTE: Route[] = [
  {
    path: 'basic',
    component: BasicComponent,
    data: { title: 'Basic Tables' },
  },
  {
    path: 'datatable',
    component: DatatableComponent,
    data: { title: 'Data Tables' },
  },
]
