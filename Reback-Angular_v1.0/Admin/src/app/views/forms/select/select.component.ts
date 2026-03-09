import { PageTitleComponent } from '@/app/components/page-title.component'
import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'
import { SelectFormInputDirective } from '@/app/directive/select-form-input.directive'
import { Component } from '@angular/core'

@Component({
  selector: 'app-select',
  standalone: true,
  imports: [
    PageTitleComponent,
    SelectFormInputDirective,
    UIExamplesListComponent,
  ],
  templateUrl: './select.component.html',
  styles: ``,
})
export class SelectComponent {}
