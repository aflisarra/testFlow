import { Component } from '@angular/core'
import { SimplebarAngularModule } from 'simplebar-angular'
import {
  friendsGroup,
  groupList,
  joinedGroup,
  suggestedGroup,
} from '../../data'
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'social-groups',
  standalone: true,
  imports: [SimplebarAngularModule, NgbDropdownModule],
  templateUrl: './groups.component.html',
  styles: ``,
})
export class GroupsComponent {
  groupList = groupList
  friendsGroup = friendsGroup
  suggestedGroup = suggestedGroup
  joinedGroup = joinedGroup
}
