import { PageTitleComponent } from '@/app/components/page-title.component'
import { Component } from '@angular/core'
import {
  NgbDropdownModule,
  NgbScrollSpyModule,
} from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-scrollspy',
  standalone: true,
  imports: [PageTitleComponent, NgbScrollSpyModule, NgbDropdownModule],
  templateUrl: './scrollspy.component.html',
  styles: ``,
})
export class ScrollspyComponent {}
