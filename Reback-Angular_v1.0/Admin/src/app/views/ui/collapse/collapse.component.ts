import { PageTitleComponent } from '@/app/components/page-title.component'
import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'
import { Component } from '@angular/core'
import { NgbCollapseModule } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-collapse',
  standalone: true,
  imports: [PageTitleComponent, NgbCollapseModule, UIExamplesListComponent],
  templateUrl: './collapse.component.html',
  styles: ``,
})
export class CollapseComponent {
  isCollapsed = true
  isHorizontal = true
  isFirstToggle = true
  isSecondToggle = true
}
