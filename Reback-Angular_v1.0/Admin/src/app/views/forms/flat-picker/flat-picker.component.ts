import { currentYear } from '@/app/common/constants'
import { PageTitleComponent } from '@/app/components/page-title.component'
import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'
import { FlatpickrDirective } from '@/app/directive/flatpickr.directive'
import { Component } from '@angular/core'

@Component({
  selector: 'app-flat-picker',
  standalone: true,
  imports: [PageTitleComponent, FlatpickrDirective, UIExamplesListComponent],
  templateUrl: './flat-picker.component.html',
  styles: ``,
})
export class FlatPickerComponent {
  currentYear = currentYear
}
