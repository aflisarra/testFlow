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

@Component({
  selector: 'app-roles-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgbModalModule],
  templateUrl: './roles-management.component.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class RolesManagementComponent implements OnInit {
  private adminService = inject(AdminManagementService)
  private modalService = inject(NgbModal)

  roles: AppRole[] = []
  actions: AppAction[] = []

  loading = false
  error = ''

  ngOnInit(): void {
    this.loadData()
  }

  loadData(): void {
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
    const ref = this.modalService.open(RoleUpsertModalComponent, {
      size: 'lg',
      centered: true,
      windowClass: 'exec-upsert-modal-window',
      backdropClass: 'exec-upsert-modal-backdrop',
    })
    ref.componentInstance.role = null
    ref.componentInstance.actions = this.actions
    ref.closed.subscribe(() => this.loadData())
  }

  getActionNames(actionIds?: number[]): string {
    if (!actionIds || actionIds.length === 0) return '-'

    return actionIds
      .map((id) => this.actions.find((a) => a._id === id)?.name || `#${id}`)
      .join(', ')
  }

  onEditRole(role: AppRole) {
    const ref = this.modalService.open(RoleUpsertModalComponent, {
      size: 'lg',
      centered: true,
      windowClass: 'exec-upsert-modal-window',
      backdropClass: 'exec-upsert-modal-backdrop',
    })
    ref.componentInstance.role = role
    ref.componentInstance.actions = this.actions
    ref.closed.subscribe(() => this.loadData())
  }

  async onDeleteRole(role: AppRole) {
    const ref = this.modalService.open(ConfirmModalComponent, {
      centered: true,
      windowClass: 'confirm-modal-window',
      backdropClass: 'confirm-modal-backdrop',
    })
    ref.componentInstance.title = 'Delete role?'
    ref.componentInstance.message = 'This will delete'
    ref.componentInstance.entityName = role.name
    ref.componentInstance.details = 'This action cannot be undone.'
    ref.componentInstance.confirmText = 'Delete'
    ref.componentInstance.cancelText = 'Cancel'
    ref.componentInstance.confirmButtonClass = 'btn-brand'

    ref.closed.subscribe(() => {
      this.adminService.deleteRole(role._id).subscribe({
        next: () => this.loadData(),
        error: (err) => {
          this.error = err?.error?.message || 'Unable to delete role'
        },
      })
    })
  }
}
