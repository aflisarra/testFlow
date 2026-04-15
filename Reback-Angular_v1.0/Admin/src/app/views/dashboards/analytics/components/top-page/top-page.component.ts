import { Component } from '@angular/core'
import { pageList } from '../../data'

@Component({
  selector: 'analytics-top-page',
  standalone: true,
  imports: [],
  templateUrl: './top-page.component.html',
  styles: ``,
})
export class TopPageComponent {
  pageList = pageList
}
