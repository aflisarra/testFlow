import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'
import { ProfileInfo } from '../../data'
import { CommonModule } from '@angular/common'
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'profile-info',
  standalone: true,
  imports: [CommonModule, NgbDropdownModule],
  templateUrl: './profile-info.component.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ProfileInfoComponent {
  profileInfo = ProfileInfo
}
