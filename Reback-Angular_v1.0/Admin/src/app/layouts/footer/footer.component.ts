import { credits, currentYear } from '@/app/common/constants'
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [],
  templateUrl: './footer.component.html',
  styles: ``,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class FooterComponent {
  year = currentYear
  credits = credits
}
