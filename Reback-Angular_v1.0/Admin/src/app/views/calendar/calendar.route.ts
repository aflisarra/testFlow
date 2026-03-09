import { Route } from '@angular/router'
import { ScheduleComponent } from './schedule/schedule.component'
import { IntegrationComponent } from './integration/integration.component'
import { CalendarHelpComponent } from './calendar-help/calendar-help.component'

export const CALENDAR_ROUTES: Route[] = [
  {
    path: 'schedule',
    component: ScheduleComponent,
    data: { title: 'Schedule' },
  },
  {
    path: 'integration',
    component: IntegrationComponent,
    data: { title: 'Integration' },
  },
  {
    path: 'help',
    component: CalendarHelpComponent,
    data: { title: 'Help' },
  },
]
