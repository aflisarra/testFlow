import { PageTitleComponent } from '@/app/components/page-title.component'
import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'
import { Component } from '@angular/core'

@Component({
  selector: 'app-breadcrumb',
  standalone: true,
  imports: [PageTitleComponent, UIExamplesListComponent],
  templateUrl: './breadcrumb.component.html',
  styles: ``,
})
export class BreadcrumbComponent {}
