import { PageTitleComponent } from '@/app/components/page-title.component'
import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'
import { Component } from '@angular/core'

@Component({
  selector: 'app-badges',
  standalone: true,
  imports: [PageTitleComponent, UIExamplesListComponent],
  templateUrl: './badges.component.html',
  styles: ``,
})
export class BadgesComponent {
  badges = [
    'Primary',
    'Secondary',
    'Success',
    'Info',
    'Warning',
    'Danger',
    'Dark',
    'Purple',
    'Pink',
    'Orange',
  ]
}
