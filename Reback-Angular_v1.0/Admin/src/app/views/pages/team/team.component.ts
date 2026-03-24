import { PageTitleComponent } from '@/app/components/page-title.component'
import { Component } from '@angular/core'
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap'
import { TeamListComponent } from './component/team-list/team-list.component'

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [PageTitleComponent, NgbDropdownModule, TeamListComponent],
  templateUrl: './team.component.html',
  styles: ``,
})
export class TeamComponent {}
