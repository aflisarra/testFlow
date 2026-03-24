import { PageTitleComponent } from '@/app/components/page-title.component'
import { Component, inject, Input, type OnInit } from '@angular/core'
import { NgbNavModule, NgbOffcanvas } from '@ng-bootstrap/ng-bootstrap'
import { SimplebarAngularModule } from 'simplebar-angular'
import { EventComponent } from './components/event/event.component'
import { FeedComponent } from './components/feed/feed.component'
import { FriendFeedComponent } from './components/friend-feed/friend-feed.component'
import { FriendListComponent } from './components/friend-list/friend-list.component'
import { GroupsComponent } from './components/groups/groups.component'
import { MemoriesComponent } from './components/memories/memories.component'
import { SavedComponent } from './components/saved/saved.component'
import { SocialMenuComponent } from './components/social-menu/social-menu.component'
import { SharedService } from './shared.service'

@Component({
  selector: 'app-social',
  standalone: true,
  imports: [
    PageTitleComponent,
    FeedComponent,
    FriendListComponent,
    NgbNavModule,
    FriendFeedComponent,
    EventComponent,
    GroupsComponent,
    SavedComponent,
    MemoriesComponent,
    SimplebarAngularModule,
    SocialMenuComponent,
  ],
  templateUrl: './social.component.html',
  styles: ``,
})
export class SocialComponent implements OnInit {
  activeTab: string = 'feed'

  public offcanvasService = inject(NgbOffcanvas)
  public sharedService = inject(SharedService)

  ngOnInit() {
    this.sharedService.activeTab$.subscribe((tab) => {
      this.activeTab = tab
    })
  }

  openMenuOffcanvas() {
    this.offcanvasService.open(SocialMenuComponent)
  }

  openFriendOffcanvas() {
    this.offcanvasService.open(FriendListComponent, { position: 'end' })
  }

  changeTab(tab: string) {
    this.sharedService.setActiveTab(tab)
  }
}
