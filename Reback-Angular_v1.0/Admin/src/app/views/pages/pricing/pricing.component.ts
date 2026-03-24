import { PageTitleComponent } from '@/app/components/page-title.component'
import { Component } from '@angular/core'
import { PricingPlans } from './data'

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [PageTitleComponent],
  templateUrl: './pricing.component.html',
  styles: ``,
})
export class PricingComponent {
  plans = PricingPlans
}
