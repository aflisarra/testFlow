import { PageTitleComponent } from '@/app/components/page-title.component'
import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'
import { Component } from '@angular/core'
import { NgbPaginationModule } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [PageTitleComponent, NgbPaginationModule, UIExamplesListComponent],
  templateUrl: './pagination.component.html',
  styles: ``,
})
export class PaginationComponent {}
