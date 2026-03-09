import { Component } from '@angular/core'
import { HelpData } from '../../data'

@Component({
  selector: 'help-list',
  standalone: true,
  imports: [],
  templateUrl: './help-list.component.html',
  styles: ``,
})
export class HelpListComponent {
  helpList = HelpData
}
