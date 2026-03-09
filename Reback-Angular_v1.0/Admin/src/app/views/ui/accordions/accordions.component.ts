import { Component } from '@angular/core'
import {
  NgbAccordionModule,
  NgbScrollSpyModule,
} from '@ng-bootstrap/ng-bootstrap'
import { accordionItem } from './data'
import { PageTitleComponent } from '@/app/components/page-title.component'
import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'

@Component({
  selector: 'app-accordions',
  standalone: true,
  imports: [NgbAccordionModule, PageTitleComponent, UIExamplesListComponent],
  templateUrl: './accordions.component.html',
  styles: ``,
})
export class AccordionsComponent {
  accordionData = accordionItem
}
