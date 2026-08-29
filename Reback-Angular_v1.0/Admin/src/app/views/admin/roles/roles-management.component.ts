import {
    AdminManagementService,
} from '@/app/core/services/admin-management.service'
import { UINotificationService } from '@/app/core/services/ui-notification.service'
import type { AppAction, AppRole } from '@/app/interfaces/admin-management.interface'
import { HasPermissionDirective } from '@/app/shared/directives/has-permission.directive'
import type { User } from '@/app/store/authentication/auth.model'
import { loginSuccess } from '@/app/store/authentication/authentication.actions'
import { getUser } from '@/app/store/authentication/authentication.selector'
import { CommonModule } from '@angular/common'
import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit, inject } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap'
import { Store } from '@ngrx/store'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'
import { take } from 'rxjs/operators'
import { ConfirmModalComponent } from '../shared/confirm-modal.component'
import { RoleUpsertModalComponent } from './role-upsert-modal.component'

@Component({
  selector: 'app-roles-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgbModalModule, RoleUpsertModalComponent, HasPermissionDirective],
  templateUrl: './roles-management.component.html',
  styleUrls: ['./roles-management.component.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class RolesManagementComponent implements OnInit {
  private adminService = inject(AdminManagementService)
  private modalService = inject(NgbModal)
  private store = inject(Store)
  private toastr = inject(ToastrService)
  private router = inject(Router)
  private uiNotify = inject(UINotificationService)

  roles: AppRole[] = []
  actions: AppAction[] = []

  loading = false
  error = ''
  permissionAlert = ''

  readonly ACTION_ADD_ROLE = 6
  readonly ACTION_EDIT_ROLE = 7
  readonly ACTION_VIEW_ROLE = 8
  readonly ACTION_DELETE_ROLE = 9
  readonly ACTION_LIST_ROLE = 17

  canAddRole = false
  canEditRole = false
  canDeleteRole = false
  canViewRoles = false
  canAccessRolesManagement = false
  readonly rolesPerPage = 4
  currentRolePage = 1

  async ngOnInit(): Promise<void> {
    await this.initPermissions()

    if (!this.canAccessRolesManagement) {
      await this.router.navigate(['/unauthorized'], { replaceUrl: true })
      return
    }

    if (this.canViewRoles) {
      this.loadRoles()
    }

    if (this.canViewRoles) {
      this.loadActions()
    }
  }

  private async initPermissions() {
    const user: User | null = await firstValueFrom(this.store.select(getUser).pipe(take(1)))
    const actions = Array.isArray(user?.actions) ? user.actions : []
    this.canAddRole = actions.includes(this.ACTION_ADD_ROLE)
    this.canEditRole = actions.includes(this.ACTION_EDIT_ROLE)
    this.canDeleteRole = actions.includes(this.ACTION_DELETE_ROLE)
    this.canViewRoles = actions.includes(this.ACTION_LIST_ROLE) || actions.includes(this.ACTION_VIEW_ROLE)
    this.canAccessRolesManagement =
      this.canAddRole || this.canEditRole || this.canDeleteRole || this.canViewRoles
  }

  loadRoles(): void {
    if (!this.canViewRoles) return
    this.loading = true
    this.error = ''
    this.adminService.getRoles().subscribe({
      next: (roles) => {
        this.roles = roles
        this.clampRolePage()
        this.loading = false
      },
      error: (err) => {
        this.error = err?.error?.message || 'Unable to load roles'
        this.loading = false
      },
    })
  }

  loadActions(): void {
    if (!this.canViewRoles) {
      this.actions = []
      return
    }
    this.loading = true
    this.error = ''
    this.adminService.getActions().subscribe({
      next: (actions) => {
        this.actions = actions
        this.loading = false
      },
      error: (err) => {
        this.error = err?.error?.message || 'Unable to load actions'
        this.loading = false
      },
    })
  }

  onCreateRoleSaved(created: boolean): void {
    if (created) {
      this.showActionSuccess('created')
      this.refreshCurrentUserPermissions()
      this.loadRoles()
    }
  }

  onCreateRoleCancelled(): void {
    // inline form handles its own reset
  }

  getActionNames(actionIds?: number[]): string {
    if (!actionIds || actionIds.length === 0) return '-'

    return actionIds
      .map((id) => {
        const raw = this.actions.find((a) => a._id === id)?.name || `#${id}`
        return this.toSentenceCase(raw)
      })
      .join(', ')
  }

  private toSentenceCase(value: string): string {
    const clean = String(value || '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()

    if (!clean) return ''
    return clean.charAt(0).toUpperCase() + clean.slice(1)
  }

  onEditRole(role: AppRole) {
    if (!this.canEditRole) {
      this.uiNotify.accessDenied('Action non autorisee: Edit Role.')
      return
    }

    const roleId = String(role?._id || '').trim()
    if (!roleId) {
      this.toastr.warning('Role id is missing. Please reload the roles list.', 'Role')
      return
    }

    const ref = this.modalService.open(RoleUpsertModalComponent, {
      size: 'lg',
      centered: true,
      windowClass: 'exec-upsert-modal-window',
      backdropClass: 'exec-upsert-modal-backdrop',
    })
    ref.componentInstance.role = role
    ref.componentInstance.actions = this.actions
    ref.closed.subscribe((updated) => {
      if (updated) {
        this.showActionSuccess('edited')
        this.refreshCurrentUserPermissions()
      }
      this.loadRoles()
    })
  }

onDeleteRole(role: AppRole) {
  if (!this.canDeleteRole) {
    this.uiNotify.accessDenied('Action non autorisee: Delete Role.')
    return
  }

  const roleId = String(role?._id || '').trim()
  if (!roleId) {
    this.toastr.warning('Role id is missing. Please reload.', 'Role')
    return
  }

  const ref = this.modalService.open(ConfirmModalComponent, {
    centered: true,
    windowClass: 'confirm-modal-window',
    backdropClass: 'confirm-modal-backdrop',
  })

  ref.componentInstance.title = 'Delete role'
  ref.componentInstance.entityName = role.name
  ref.componentInstance.confirmText = 'Delete'
  ref.componentInstance.cancelText = 'Cancel'
  ref.componentInstance.confirmButtonClass = 'btn-delete-confirm'

  ref.closed.subscribe(() => {
    this.adminService.deleteRole(roleId).subscribe({
      next: () => {
        this.showActionSuccess('deleted')
        this.refreshCurrentUserPermissions()
        this.loadRoles()
      },
      error: (err) => {
        const code = err?.error?.code

        if (code === 'ROLE_IN_USE') {
          const usersCount = Number(err?.error?.usersCount ?? err?.error?.users?.length ?? 0)
          this.openRoleInUseModal(role, usersCount)
          return
        }

        this.toastr.warning(err?.error?.message || 'Unable to delete role', 'Role')
      },
    })
  })
}

openRoleInUseModal(role: AppRole, usersCount: number) {
  const userLabel = usersCount === 1 ? 'user' : 'users'
  const ref = this.modalService.open(ConfirmModalComponent, {
    centered: true,
    windowClass: 'confirm-modal-window',
    backdropClass: 'confirm-modal-backdrop',
  })

  ref.componentInstance.title = 'Role in use'
  ref.componentInstance.message = `This role is assigned to ${usersCount} ${userLabel}.`
  ref.componentInstance.details = `Reassign users before deleting ${role.name}.`
  ref.componentInstance.confirmText = 'Reassign'
  ref.componentInstance.cancelText = 'Cancel'
  ref.componentInstance.confirmButtonClass = 'btn-brand'
  ref.componentInstance.icon = 'iconamoon:attention-circle-duotone'

  ref.closed.subscribe(() => {
    this.openReassignModal(role)
  })
}

openReassignModal(role: AppRole) {
  const options = this.roles
    .filter((r) => r._id !== role._id)
    .map((r) => ({ value: r._id, label: r.name }))

  const ref = this.modalService.open(ConfirmModalComponent, {
    centered: true,
    windowClass: 'confirm-modal-window',
    backdropClass: 'confirm-modal-backdrop',
  })

  ref.componentInstance.title = 'Reassign role'
  ref.componentInstance.message = `Choose a new role for users assigned to ${role.name}.`
  ref.componentInstance.confirmText = 'Reassign'
  ref.componentInstance.cancelText = 'Cancel'
  ref.componentInstance.confirmButtonClass = 'btn-brand'
  ref.componentInstance.icon = 'iconamoon:swap-duotone'
  ref.componentInstance.selectLabel = 'New role'
  ref.componentInstance.selectOptions = options
  ref.componentInstance.requireSelection = true

  ref.closed.subscribe((newRoleId) => {
    if (!newRoleId) return
    this.reassignAndDeleteRole(role._id, newRoleId)
  })
}

reassignAndDeleteRole(oldRoleId: string, newRoleId: string) {
  this.adminService.reassignAndDelete(oldRoleId, newRoleId)
    .subscribe({
      next: () => {
        this.uiNotify.success('Role replaced successfully')
        this.loadRoles()
      },

      error: () => {
        this.uiNotify.accessDenied('Operation failed')
      }
    })
}

  private showActionSuccess(action: 'created' | 'edited' | 'deleted') {
    const title = action.charAt(0).toUpperCase() + action.slice(1)
    this.uiNotify.success(`Role ${title.toLowerCase()} successfully.`)
  }

  private refreshCurrentUserPermissions() {
    this.adminService.getCurrentUserProfile().subscribe({
      next: async (resp) => {
        const current: User | null = await firstValueFrom(this.store.select(getUser).pipe(take(1)))
        if (!current) return

        const updatedUser: User = {
          ...current,
          id: current.id || resp.user._id || '',
          _id: current._id || resp.user._id || '',
          username: resp.user.name || current.username || '',
          email: resp.user.email || current.email || '',
          picture: resp.user.picture ?? current.picture ?? null,
          role: resp.user.role || current.role || '',
          actions: Array.isArray(resp.actions) ? resp.actions : [],
          token: current.token || '',
        }

        this.store.dispatch(loginSuccess({ user: updatedUser }))
        await this.initPermissions()
      },
      error: () => {
        // Ignore sync errors to avoid blocking role management actions
      },
    })
  }

  get totalRolePages(): number {
    return Math.max(1, Math.ceil(this.roles.length / this.rolesPerPage))
  }

  get paginatedRoles(): AppRole[] {
    const start = (this.currentRolePage - 1) * this.rolesPerPage
    return this.roles.slice(start, start + this.rolesPerPage)
  }

  get rolesRangeStart(): number {
    if (this.roles.length === 0) return 0
    return (this.currentRolePage - 1) * this.rolesPerPage + 1
  }

  get rolesRangeEnd(): number {
    return Math.min(this.currentRolePage * this.rolesPerPage, this.roles.length)
  }

  onPrevRolesPage(): void {
    if (this.currentRolePage > 1) this.currentRolePage--
  }

  onNextRolesPage(): void {
    if (this.currentRolePage < this.totalRolePages) this.currentRolePage++
  }

  private clampRolePage(): void {
    if (this.currentRolePage < 1) this.currentRolePage = 1
    if (this.currentRolePage > this.totalRolePages) this.currentRolePage = this.totalRolePages
  }
}
