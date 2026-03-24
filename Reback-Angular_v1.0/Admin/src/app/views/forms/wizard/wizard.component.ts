import { PageTitleComponent } from '@/app/components/page-title.component'
import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core'
import { NgbNavModule } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-wizard',
  standalone: true,
  imports: [PageTitleComponent, NgbNavModule],
  templateUrl: './wizard.component.html',
  styles: ``,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class WizardComponent {
  active = 1
  activeId = 1
}
