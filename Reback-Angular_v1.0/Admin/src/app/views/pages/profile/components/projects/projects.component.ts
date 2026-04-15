import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'
import { ProjectData } from '../../data'
import {
  NgbDropdownModule,
  NgbProgressbarModule,
  NgbTooltipModule,
} from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'profile-projects',
  standalone: true,
  imports: [NgbProgressbarModule, NgbDropdownModule, NgbTooltipModule],
  templateUrl: './projects.component.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ProjectsComponent {
  projectList = ProjectData
}
