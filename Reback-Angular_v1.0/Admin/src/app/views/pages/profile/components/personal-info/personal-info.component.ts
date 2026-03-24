import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'
import { ProfileInfo } from '../../data'

@Component({
  selector: 'profile-personal-info',
  standalone: true,
  imports: [],
  templateUrl: './personal-info.component.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class PersonalInfoComponent {
  profileInfo = ProfileInfo
}
