import { Component } from '@angular/core'
import { SkillData } from '../../data'
import { NgbProgressbarModule } from '@ng-bootstrap/ng-bootstrap'
import { CommonModule } from '@angular/common'

@Component({
  selector: 'profile-skill',
  standalone: true,
  imports: [NgbProgressbarModule, CommonModule],
  templateUrl: './skill.component.html',
  styles: ``,
})
export class SkillComponent {
  skillData = SkillData
}
