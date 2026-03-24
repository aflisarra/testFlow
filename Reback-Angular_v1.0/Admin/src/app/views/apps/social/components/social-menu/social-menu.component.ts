import {
  Component,
  EventEmitter,
  inject,
  Input,
  Output,
  type OnInit,
} from '@angular/core'
import { EventData, ProfileDetail } from '../../data'
import { CommonModule } from '@angular/common'
import { SharedService } from '../../shared.service'

@Component({
  selector: 'social-menu',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './social-menu.component.html',
  styles: ``,
})
export class SocialMenuComponent implements OnInit {
  profileDetail = ProfileDetail
  eventList = EventData

  activeTab: string = 'feed'

  public sharedService = inject(SharedService)

  ngOnInit(): void {
    this.sharedService.activeTab$.subscribe((tab) => {
      this.activeTab = tab
    })
  }

  changeTab(tab: string) {
    this.sharedService.setActiveTab(tab)
  }
}
