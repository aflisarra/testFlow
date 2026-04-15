import { PageTitleComponent } from '@/app/components/page-title.component'
import { Component } from '@angular/core'
import { FaqData } from './data'
import { NgbAccordionModule } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-faqs',
  standalone: true,
  imports: [PageTitleComponent, NgbAccordionModule],
  templateUrl: './faqs.component.html',
  styles: ``,
})
export class FaqsComponent {
  faqList = FaqData
}
