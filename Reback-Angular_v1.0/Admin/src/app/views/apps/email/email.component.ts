import { PageTitleComponent } from '@/app/components/page-title.component'
import { Component } from '@angular/core'
import { ComposeComponent } from './components/compose/compose.component'
import { EmailListComponent } from './components/email-list/email-list.component'
import { EmailTopbarComponent } from './components/email-topbar/email-topbar.component'

@Component({
  selector: 'app-email',
  standalone: true,
  imports: [PageTitleComponent, ComposeComponent, EmailTopbarComponent],
  templateUrl: './email.component.html',
  styles: ``,
})
export class EmailComponent {}
