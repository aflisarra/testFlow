import { PageTitleComponent } from '@/app/components/page-title.component'
import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'
import { Component } from '@angular/core'
import { NgbNavModule } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [PageTitleComponent, NgbNavModule, UIExamplesListComponent],
  templateUrl: './tabs.component.html',
  styles: ``,
})
export class TabsComponent {}
