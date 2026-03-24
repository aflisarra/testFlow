import { PageTitleComponent } from '@/app/components/page-title.component'
import { Component } from '@angular/core'
import { IntegrationData } from './data'

@Component({
  selector: 'app-integration',
  standalone: true,
  imports: [PageTitleComponent],
  templateUrl: './integration.component.html',
  styles: ``,
})
export class IntegrationComponent {
  integrationList = IntegrationData
}
