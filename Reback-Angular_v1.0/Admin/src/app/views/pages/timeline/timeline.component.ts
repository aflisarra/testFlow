import { PageTitleComponent } from '@/app/components/page-title.component'
import { Component } from '@angular/core'
import { LeftTimelineComponent } from './components/left-timeline/left-timeline.component'
import { TimelineData } from './data'
import { CommonModule } from '@angular/common'

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [PageTitleComponent, LeftTimelineComponent, CommonModule],
  templateUrl: './timeline.component.html',
  styles: ``,
})
export class TimelineComponent {
  timelineList = TimelineData
}
