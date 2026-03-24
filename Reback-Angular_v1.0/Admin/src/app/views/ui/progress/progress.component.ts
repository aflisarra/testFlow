import { PageTitleComponent } from '@/app/components/page-title.component'
import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'
import { Component } from '@angular/core'
import { NgbProgressbarModule } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-progress',
  standalone: true,
  imports: [PageTitleComponent, NgbProgressbarModule, UIExamplesListComponent],
  templateUrl: './progress.component.html',
  styles: ``,
})
export class ProgressComponent {}
