import { changetheme } from '@/app/store/layout/layout-action'
import { CommonModule, DOCUMENT } from '@angular/common'
import {
  CUSTOM_ELEMENTS_SCHEMA,
  Component,
  EventEmitter,
  Inject,
  Output,
  inject,
  type TemplateRef,
} from '@angular/core'
import {
  NgbDropdownModule,
  NgbOffcanvas,
  NgbOffcanvasModule,
  NgbTooltipModule,
} from '@ng-bootstrap/ng-bootstrap'
import { Store } from '@ngrx/store'
import { SimplebarAngularModule } from 'simplebar-angular'
import { getLayoutColor } from '../../store/layout/layout-selector'
import { logout } from '@/app/store/authentication/authentication.actions'
import { Router, RouterLink } from '@angular/router'
import { activityStreamData, appsData, notificationsData } from './data'

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [
    NgbDropdownModule,
    SimplebarAngularModule,
    NgbOffcanvasModule,
    RouterLink,
    CommonModule,
    NgbTooltipModule,
  ],
  templateUrl: './topbar.component.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TopbarComponent {
  element: any

  router = inject(Router)
  store = inject(Store)
  offcanvasService = inject(NgbOffcanvas)

  notificationList = notificationsData
  appsList = appsData
  activityList = activityStreamData

  constructor(@Inject(DOCUMENT) private document: any) {}
  @Output() settingsButtonClicked = new EventEmitter()
  @Output() mobileMenuButtonClicked = new EventEmitter()

  ngOnInit(): void {
    this.element = document.documentElement
  }

  settingMenu() {
    this.settingsButtonClicked.emit()
  }

  /**
   * Toggle the menu bar when having mobile screen
   */
  toggleMobileMenu() {
    // document.getElementById('topnav-hamburger-icon')?.classList.toggle('open');
    this.mobileMenuButtonClicked.emit()
  }

  // Change Theme
  changeTheme() {
    const color = document.documentElement.getAttribute('data-bs-theme')
    console.log(color)
    if (color == 'light') {
      this.store.dispatch(changetheme({ color: 'dark' }))
    } else {
      this.store.dispatch(changetheme({ color: 'light' }))
    }
    this.store.select(getLayoutColor).subscribe((color) => {
      document.documentElement.setAttribute('data-bs-theme', color)
    })
  }

  open(content: TemplateRef<any>) {
    this.offcanvasService.open(content, {
      position: 'end',
      panelClass: 'border-0 width-auto',
    })
  }

  logout() {
    this.store.dispatch(logout())
  }

  getFileExtensionIcon(file: any) {
    const dotIndex = file.lastIndexOf('.')
    const extension = file.slice(dotIndex + 1)
    if (extension == 'docs') {
      return 'bxs-file-doc'
    } else if (extension == 'zip') {
      return 'bxs-file-archive'
    } else {
      return 'bxl-figma '
    }
  }

  getActivityIcon(type: string) {
    if (type == 'task') {
      return 'iconamoon:folder-check-duotone'
    } else if (type == 'design') {
      return 'iconamoon:check-circle-1-duotone'
    } else {
      return 'iconamoon:certificate-badge-duotone'
    }
  }
}
