import { PageTitleComponent } from '@/app/components/page-title.component'
import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'
import { Component } from '@angular/core'
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-tooltips',
  standalone: true,
  imports: [PageTitleComponent, NgbTooltipModule, UIExamplesListComponent],
  templateUrl: './tooltips.component.html',
  styles: ``,
})
export class TooltipsComponent {}
