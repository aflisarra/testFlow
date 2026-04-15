import { Component } from '@angular/core'
import { ContactFormComponent } from './components/contact-form/contact-form.component'
import { InquiriesComponent } from './components/inquiries/inquiries.component'

@Component({
  selector: 'app-contact-us',
  standalone: true,
  imports: [ContactFormComponent, InquiriesComponent],
  templateUrl: './contact-us.component.html',
  styles: ``,
})
export class ContactUsComponent {}
