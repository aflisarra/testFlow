import { PageTitleComponent } from '@/app/components/page-title.component'
import { Component } from '@angular/core'
import { SearchComponent } from './components/search/search.component'
import { HelpListComponent } from './components/help-list/help-list.component'
import { QuestionsComponent } from './components/questions/questions.component'

@Component({
  selector: 'app-calendar-help',
  standalone: true,
  imports: [
    PageTitleComponent,
    SearchComponent,
    HelpListComponent,
    QuestionsComponent,
  ],
  templateUrl: './calendar-help.component.html',
  styles: ``,
})
export class CalendarHelpComponent {}
