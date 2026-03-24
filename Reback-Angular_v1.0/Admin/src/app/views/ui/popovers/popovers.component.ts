import { PageTitleComponent } from '@/app/components/page-title.component'
import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'
import { Component } from '@angular/core'
import { NgbPopoverModule } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-popovers',
  standalone: true,
  imports: [PageTitleComponent, NgbPopoverModule, UIExamplesListComponent],
  templateUrl: './popovers.component.html',
  styles: ``,
})
export class PopoversComponent {}
