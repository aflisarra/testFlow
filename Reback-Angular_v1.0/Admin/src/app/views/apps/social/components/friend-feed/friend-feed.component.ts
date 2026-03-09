import { Component } from '@angular/core'
import { FriendRequest, PendingRequest } from '../../data'
import { NgbDropdownModule, NgbNavModule } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'social-friend-feed',
  standalone: true,
  imports: [NgbDropdownModule, NgbNavModule],
  templateUrl: './friend-feed.component.html',
  styles: ``,
})
export class FriendFeedComponent {
  friendList = FriendRequest
  pendingList = PendingRequest
}
