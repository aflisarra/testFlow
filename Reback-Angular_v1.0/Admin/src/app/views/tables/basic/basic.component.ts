import { currentYear } from '@/app/common/constants'
import { PageTitleComponent } from '@/app/components/page-title.component'
import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'
import { Component } from '@angular/core'

@Component({
  selector: 'app-basic',
  standalone: true,
  imports: [PageTitleComponent, UIExamplesListComponent],
  templateUrl: './basic.component.html',
  styles: ``,
})
export class BasicComponent {
  currentYear = currentYear
}
