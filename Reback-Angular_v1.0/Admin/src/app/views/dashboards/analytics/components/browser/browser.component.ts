import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'
import { browserList } from '../../data'
import { SimplebarAngularModule } from 'simplebar-angular'
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'analytics-browser',
  standalone: true,
  imports: [SimplebarAngularModule, NgbDropdownModule],
  templateUrl: './browser.component.html',
  styles: ``,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class BrowserComponent {
  browserData = browserList
}
