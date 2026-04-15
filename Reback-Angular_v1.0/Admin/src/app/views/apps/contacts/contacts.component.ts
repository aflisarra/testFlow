import { PageTitleComponent } from '@/app/components/page-title.component'
import { Component } from '@angular/core'
import { contactData } from './data'
import { RouterLink } from '@angular/router'

@Component({
  selector: 'app-contacts',
  standalone: true,
  imports: [PageTitleComponent, RouterLink],
  templateUrl: './contacts.component.html',
  styles: ``,
})
export class ContactsComponent {
  contactList = contactData
}
