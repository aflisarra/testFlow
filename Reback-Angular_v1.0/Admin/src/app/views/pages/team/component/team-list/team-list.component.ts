import { Component } from '@angular/core'
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap'
import { OurTeamData } from '../../data'

@Component({
  selector: 'team-list',
  standalone: true,
  imports: [NgbTooltipModule],
  templateUrl: './team-list.component.html',
  styles: ``,
})
export class TeamListComponent {
  ourTeamList = OurTeamData
}
