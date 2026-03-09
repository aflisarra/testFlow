import { PageTitleComponent } from '@/app/components/page-title.component'
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'
import { StateComponent } from './components/state/state.component'
import { ConversationComponent } from './components/conversation/conversation.component'
import { PerformanceComponent } from './components/performance/performance.component'
import { SessionbycountyComponent } from './components/sessionbycounty/sessionbycounty.component'
import { BrowserComponent } from './components/browser/browser.component'
import { TopPageComponent } from './components/top-page/top-page.component'

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [],
  templateUrl: './analytics.component.html',
  styles: ``,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AnalyticsComponent {}
