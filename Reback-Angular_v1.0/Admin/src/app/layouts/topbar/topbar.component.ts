import { changetheme } from '@/app/store/layout/layout-action'
import { CommonModule, DOCUMENT } from '@angular/common'
import {
  CUSTOM_ELEMENTS_SCHEMA,
  Component,
  DestroyRef,
  EventEmitter,
  Inject,
  Output,
  inject,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap'
import { Store } from '@ngrx/store'
import { getLayoutColor } from '../../store/layout/layout-selector'
import { logout } from '@/app/store/authentication/authentication.actions'
import { Router, RouterLink } from '@angular/router'
import { getUser } from '@/app/store/authentication/authentication.selector'
import { AuthenticationService } from '@/app/core/services/auth.service'

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [
    NgbDropdownModule,
    RouterLink,
    CommonModule,
  ],
  templateUrl: './topbar.component.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TopbarComponent {
  element: any

  router = inject(Router)
  store = inject(Store)
  authService = inject(AuthenticationService)
  destroyRef = inject(DestroyRef)

  userName = ''
  userPicture: string | null = null
  readonly defaultAvatar = 'assets/images/users/default-user.svg'
  private readonly backendOrigin = 'http://localhost:3000'

  constructor(@Inject(DOCUMENT) private document: any) {}
  @Output() mobileMenuButtonClicked = new EventEmitter()

  ngOnInit(): void {
    this.element = document.documentElement
    this.store
      .select(getUser)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        this.userName = user?.username || this.authService.currentUserName || ''
        this.userPicture = (user as any)?.picture || this.authService.currentUserPicture
      })
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

  logout() {
    this.store.dispatch(logout())
  }

  resolveAvatarUrl(picture?: string | null): string {
    const raw = String(picture || '').trim()
    if (!raw) return this.defaultAvatar
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
    if (raw.startsWith('/')) return `${this.backendOrigin}${raw}`
    return raw
  }
}
