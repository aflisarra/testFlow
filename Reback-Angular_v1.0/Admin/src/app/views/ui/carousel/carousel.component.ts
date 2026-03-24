import { PageTitleComponent } from '@/app/components/page-title.component'
import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'
import { CommonModule } from '@angular/common'
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'
import { FormsModule } from '@angular/forms'
import {
  NgbCarouselConfig,
  NgbCarouselModule,
} from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-carousel',
  standalone: true,
  imports: [
    PageTitleComponent,
    NgbCarouselModule,
    UIExamplesListComponent,
    CommonModule,
    FormsModule,
  ],
  templateUrl: './carousel.component.html',
  styles: ``,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class CarouselComponent {
  show = true
  show1 = true
  show2 = true

  curentsection: string = 'slides-only'
  showNavigationArrows = false
  showNavigationIndicators = false

  constructor(config: NgbCarouselConfig) {
    config.showNavigationArrows = true
    config.showNavigationIndicators = true
  }
}
