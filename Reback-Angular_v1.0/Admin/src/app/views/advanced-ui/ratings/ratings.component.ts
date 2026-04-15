import { PageTitleComponent } from '@/app/components/page-title.component'
import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'
import { Component } from '@angular/core'
import {
  FormControl,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms'
import { NgbRatingModule } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-ratings',
  standalone: true,
  imports: [
    PageTitleComponent,
    NgbRatingModule,
    ReactiveFormsModule,
    UIExamplesListComponent,
  ],
  templateUrl: './ratings.component.html',
  styles: ``,
})
export class RatingsComponent {
  basicRating = 5
  rating = 3
  stepRating = 0
  currentRate = 2
  selected = 0
  hovered = 0
  hoverSelected = 1
  readonly = 3.5
  ariaValueText(current: number, max: number) {
    return `${current} out of ${max} hearts`
  }
  ctrl = new FormControl<number | null>(null, Validators.required)
}
