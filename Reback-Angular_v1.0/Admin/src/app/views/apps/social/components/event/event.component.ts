import { Component } from '@angular/core'
import { EventList } from '../../data'

@Component({
  selector: 'social-event',
  standalone: true,
  imports: [],
  templateUrl: './event.component.html',
  styles: ``,
})
export class EventComponent {
  events = EventList
}
