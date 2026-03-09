import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'
import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core'
import {
  NgbDropdownConfig,
  NgbDropdownModule,
} from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-dropdowns',
  standalone: true,
  imports: [NgbDropdownModule, UIExamplesListComponent],
  templateUrl: './dropdowns.component.html',
  styles: ``,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class DropdownsComponent {
  constructor(config: NgbDropdownConfig) {
    // config.placement = 'top-start';
    config.autoClose = false
  }

  navItems = [
    { label: 'Single Button Dropdowns', link: '#single-button' },
    {
      label: 'Single Button Variant Dropdowns',
      link: '#single-button-variant',
    },
    { label: 'Split Button Dropdowns', link: '#split-button' },
    { label: 'Dark Dropdown', link: '#dark-dropdown' },
    { label: 'Dropdown Direction', link: '#direction' },
    { label: 'Dropdown Menu Items', link: '#menu-items' },
    { label: 'Dropdown Options', link: '#dropdown-options' },
    { label: 'Auto Close Behavior', link: '#auto-close-behavior' },
    { label: 'Menu content', link: '#menu-content' },
  ]
}
