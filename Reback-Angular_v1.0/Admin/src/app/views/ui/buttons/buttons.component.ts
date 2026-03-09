import { PageTitleComponent } from '@/app/components/page-title.component'
import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'
import { CommonModule } from '@angular/common'
import { Component } from '@angular/core'
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-buttons',
  standalone: true,
  imports: [
    PageTitleComponent,
    CommonModule,
    NgbDropdownModule,
    UIExamplesListComponent,
  ],
  templateUrl: './buttons.component.html',
  styles: ``,
})
export class ButtonsComponent {
  buttons = [
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
    'Light',
    'Link',
  ]
  outlineButton = [
    'Primary',
    'Secondary',
    'Success',
    'Info',
    'Warning',
    'Purple',
    'Pink',
    'Orange',
  ]
}
