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
import { ProjectInvitationsService, type ProjectInvitationDto } from '@/app/core/services/project-invitations.service'
import { ProjectsRefreshService } from '@/app/core/services/projects-refresh.service'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [
    NgbDropdownModule,
    RouterLink,
    CommonModule,
  ],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TopbarComponent {
  element: any

  router = inject(Router)
  store = inject(Store)
  authService = inject(AuthenticationService)
  private invitationsService = inject(ProjectInvitationsService)
  private projectsRefresh = inject(ProjectsRefreshService)
  private toastr = inject(ToastrService)
  destroyRef = inject(DestroyRef)

  userName = ''
  userPicture: string | null = null
  readonly defaultAvatar = 'assets/images/users/default-user.svg'
  private readonly backendOrigin = 'http://localhost:3000'

  invitations: ProjectInvitationDto[] = []
  invitationsLoading = false
  acceptingId: string | null = null
  ignoringId: string | null = null

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

    void this.refreshInvitations()
  }

  get pendingInvitationsCount(): number {
    return Array.isArray(this.invitations) ? this.invitations.length : 0
  }

  async refreshInvitations(): Promise<void> {
    this.invitationsLoading = true
    try {
      const invites = await firstValueFrom(this.invitationsService.getMyPendingInvitations())
      this.invitations = Array.isArray(invites) ? invites : []
    } catch {
      this.invitations = []
    } finally {
      this.invitationsLoading = false
    }
  }

  async onInvitationsOpenChange(open: boolean) {
    if (!open) return
    await this.refreshInvitations()
  }

  async acceptInvite(invite: ProjectInvitationDto) {
    const id = String(invite?._id || '').trim()
    if (!id) return
    this.acceptingId = id
    try {
      const resp = await firstValueFrom(this.invitationsService.acceptInvitation(id))
      this.toastr.success('Project invitation accepted.', 'Project')
      await this.refreshInvitations()

      // Refresh project lists across pages (Project + Test Plan dropdown, etc.)
      this.projectsRefresh.notify()

      const projectId =
        String((resp as any)?.projectId || invite?.projectId?._id || '').trim()
      if (projectId) {
        await this.router.navigate(['/project'], {
          queryParams: { selectedProjectId: projectId },
        })
      } else {
        await this.router.navigate(['/project'])
      }
    } catch (err: any) {
      this.toastr.error(err?.error?.message || 'Unable to accept invitation', 'Project')
    } finally {
      this.acceptingId = null
    }
  }

  async ignoreInvite(invite: ProjectInvitationDto) {
    const id = String(invite?._id || '').trim()
    if (!id) return
    this.ignoringId = id
    try {
      await firstValueFrom(this.invitationsService.ignoreInvitation(id))
      this.toastr.info('Invitation ignored.', 'Project')
      await this.refreshInvitations()
    } catch (err: any) {
      this.toastr.error(err?.error?.message || 'Unable to ignore invitation', 'Project')
    } finally {
      this.ignoringId = null
    }
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
