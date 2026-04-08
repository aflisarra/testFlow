import { CommonModule } from '@angular/common'
import { CUSTOM_ELEMENTS_SCHEMA, Component, OnInit, inject } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import {
  AdminManagementService,
  AppAction,
  AppRole,
} from '@/app/core/services/admin-management.service'
import { NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap'
import { ConfirmModalComponent } from '../shared/confirm-modal.component'
import { RoleUpsertModalComponent } from './role-upsert-modal.component'
import { Store } from '@ngrx/store'
import { getUser } from '@/app/store/authentication/authentication.selector'
import { firstValueFrom } from 'rxjs'
import { take } from 'rxjs/operators'
import { ToastrService } from 'ngx-toastr'
import { loginSuccess } from '@/app/store/authentication/authentication.actions'

@Component({
  selector: 'app-roles-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgbModalModule],
  templateUrl: './roles-management.component.html',
  styleUrls: ['./roles-management.component.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class RolesManagementComponent implements OnInit {
  private adminService = inject(AdminManagementService)
  private modalService = inject(NgbModal)
  private store = inject(Store)
  private toastr = inject(ToastrService)

  roles: AppRole[] = []
  actions: AppAction[] = []

  loading = false
  error = ''
  permissionAlert = ''

  private readonly ACTION_ADD_ROLE = 6
  private readonly ACTION_EDIT_ROLE = 7
  private readonly ACTION_VIEW_ROLE = 8
  private readonly ACTION_DELETE_ROLE = 9

  canAddRole = false
  canEditRole = false
  canDeleteRole = false
  canViewRoles = false

  async ngOnInit(): Promise<void> {
    await this.initPermissions()
    if (this.canViewRoles) {
      this.loadData()
    } else {
      this.notifyPermissionDenied("Acces refuse: vous n'avez pas l'action View Role.")
    }
  }

  private async initPermissions() {
    const user = await firstValueFrom(this.store.select(getUser).pipe(take(1)))
    const actions = Array.isArray((user as any)?.actions) ? (user as any).actions : []
    this.canAddRole = actions.includes(this.ACTION_ADD_ROLE)
    this.canEditRole = actions.includes(this.ACTION_EDIT_ROLE)
    this.canDeleteRole = actions.includes(this.ACTION_DELETE_ROLE)
    this.canViewRoles = actions.includes(this.ACTION_VIEW_ROLE)
  }

  loadData(): void {
    if (!this.canViewRoles) {
      this.notifyPermissionDenied("Acces refuse: vous n'avez pas l'action View Role.")
      this.roles = []
      this.actions = []
      return
    }

    this.loading = true
    this.error = ''

    this.adminService.getActions().subscribe({
      next: (actions) => {
        this.actions = actions
        this.adminService.getRoles().subscribe({
          next: (roles) => {
            this.roles = roles
            this.loading = false
          },
          error: (err) => {
            this.error = err?.error?.message || 'Unable to load roles'
            this.loading = false
          },
        })
      },
      error: (err) => {
        this.error = err?.error?.message || 'Unable to load actions'
        this.loading = false
      },
    })
  }

  onCreateRole(): void {
    if (!this.canAddRole) {
      this.notifyPermissionDenied('Action non autorisee: Add Role.')
      return
    }

    const ref = this.modalService.open(RoleUpsertModalComponent, {
      size: 'lg',
      centered: true,
      windowClass: 'exec-upsert-modal-window',
      backdropClass: 'exec-upsert-modal-backdrop',
    })
    ref.componentInstance.role = null
    ref.componentInstance.actions = this.actions
    ref.closed.subscribe((created) => {
      if (created) {
        this.showActionSuccess('created')
        this.refreshCurrentUserPermissions()
      }
      this.loadData()
    })
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
      this.notifyPermissionDenied('Action non autorisee: Edit Role.')
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
      this.loadData()
    })
  }

  async onDeleteRole(role: AppRole) {
    if (!this.canDeleteRole) {
      this.notifyPermissionDenied('Action non autorisee: Delete Role.')
      return
    }

    const ref = this.modalService.open(ConfirmModalComponent, {
      centered: true,
      windowClass: 'confirm-modal-window',
      backdropClass: 'confirm-modal-backdrop',
    })
    ref.componentInstance.title = 'Delete role ?'
    //ref.componentInstance.message = 'This will delete'
    ref.componentInstance.entityName = role.name
    //ref.componentInstance.details = 'This action cannot be undone.'
    ref.componentInstance.confirmText = 'Delete'
    ref.componentInstance.cancelText = 'Cancel'
    ref.componentInstance.confirmButtonClass = 'btn-brand'

    ref.closed.subscribe(() => {
      this.adminService.deleteRole(role._id).subscribe({
        next: () => {
          this.showActionSuccess('deleted')
          this.refreshCurrentUserPermissions()
          this.loadData()
        },
        error: (err) => {
          this.error = err?.error?.message || 'Unable to delete role'
        },
      })
    })
  }

  private notifyPermissionDenied(message: string) {
    this.permissionAlert = message
    this.toastr.warning(message, 'Permission')
  }

  private showActionSuccess(action: 'created' | 'edited' | 'deleted') {
    const title = action.charAt(0).toUpperCase() + action.slice(1)
    this.toastr.success('This action was completed successfully.', title)
  }

  private refreshCurrentUserPermissions() {
    this.adminService.getCurrentUserProfile().subscribe({
      next: async (resp) => {
        const current = await firstValueFrom(this.store.select(getUser).pipe(take(1)))
        if (!current) return

        const updatedUser = {
          ...current,
          id: (resp?.user as any)?._id || (current as any)?.id || '',
          username: resp?.user?.name || (current as any)?.username || '',
          email: resp?.user?.email || (current as any)?.email || '',
          picture: resp?.user?.picture ?? (current as any)?.picture ?? null,
          role: resp?.user?.role || (current as any)?.role || '',
          actions: Array.isArray(resp?.actions) ? resp.actions : [],
          token: (current as any)?.token || '',
        }

        this.store.dispatch(loginSuccess({ user: updatedUser as any }))
        await this.initPermissions()
      },
      error: () => {
        // Ignore sync errors to avoid blocking role management actions
      },
    })
  }
}
