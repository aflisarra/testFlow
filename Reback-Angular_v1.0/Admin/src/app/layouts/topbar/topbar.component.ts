import { changetheme } from '@/app/store/layout/layout-action'
import { CommonModule, DOCUMENT } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import {
  CUSTOM_ELEMENTS_SCHEMA,
  Component,
  DestroyRef,
  EventEmitter,
  Output,
  inject, OnInit,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap'
import { Store } from '@ngrx/store'
import { getLayoutColor } from '../../store/layout/layout-selector'
import { logout } from '@/app/store/authentication/authentication.actions'
import { Router } from '@angular/router'
import { getUser } from '@/app/store/authentication/authentication.selector'
import { AuthenticationService } from '@/app/core/services/auth.service'
import { ProjectInvitationsService } from '@/app/core/services/project-invitations.service'
import type { ProjectInvitationDto } from '@/app/interfaces/project-invitations.interface'
import { ProjectsRefreshService } from '@/app/core/services/projects-refresh.service'
import { ApiService } from '@/app/core/services/api.service'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [
    NgbDropdownModule,
    //RouterLink,
    CommonModule,
  ],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TopbarComponent implements OnInit {
  router = inject(Router)
  store = inject(Store)
  authService = inject(AuthenticationService)
  private invitationsService = inject(ProjectInvitationsService)
  private projectsRefresh = inject(ProjectsRefreshService)
  private toastr = inject(ToastrService)
  private api = inject(ApiService)
  destroyRef = inject(DestroyRef)
  private document = inject(DOCUMENT)

  element: HTMLElement = this.document.documentElement

  userName = ''
  userPicture: string | null = null
  readonly defaultAvatar = 'assets/images/users/default-user.svg'

  invitations: ProjectInvitationDto[] = []
  invitationsLoading = false
  acceptingId: string | null = null
  ignoringId: string | null = null

  @Output() mobileMenuButtonClicked = new EventEmitter()

  ngOnInit(): void {
    this.element = this.document.documentElement
    this.store
      .select(getUser)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        this.userName = user?.username || this.authService.currentUserName || ''
        this.userPicture = user?.picture ?? this.authService.currentUserPicture
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

      const respProjectId = (resp as { projectId?: string | null } | null | undefined)?.projectId
      const projectId = String(respProjectId || invite?.projectId?._id || '').trim()
      if (projectId) {
        await this.router.navigate(['/project'], {
          queryParams: { selectedProjectId: projectId },
        })
      } else {
        await this.router.navigate(['/project'])
      }
    } catch (err: unknown) {
      const message =
        err instanceof HttpErrorResponse
          ? (() => {
              const body = err.error as { message?: unknown } | null
              const bodyMessage =
                body && typeof body === 'object' && typeof body.message === 'string'
                  ? body.message
                  : ''
              return bodyMessage || err.message || 'Unable to accept invitation'
            })()
          : 'Unable to accept invitation'
      this.toastr.error(message, 'Project')
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
    } catch (err: unknown) {
      const message =
        err instanceof HttpErrorResponse
          ? (() => {
              const body = err.error as { message?: unknown } | null
              const bodyMessage =
                body && typeof body === 'object' && typeof body.message === 'string'
                  ? body.message
                  : ''
              return bodyMessage || err.message || 'Unable to ignore invitation'
            })()
          : 'Unable to ignore invitation'
      this.toastr.error(message, 'Project')
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
    if (this.isAbsoluteHttpUrl(raw)) return raw
    if (raw.startsWith('/')) return this.api.toAbsoluteUrl(raw)
    return raw
  }

  private isAbsoluteHttpUrl(value: string): boolean {
    try {
      const u = new URL(value)
      return u.protocol === 'http:' || u.protocol === 'https:'
    } catch {
      return false
    }
  }
}
