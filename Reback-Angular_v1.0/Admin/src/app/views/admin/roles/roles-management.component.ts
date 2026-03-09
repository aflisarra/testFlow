import { CommonModule } from '@angular/common'
import { Component, OnInit, inject } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import {
  AdminManagementService,
  AppAction,
  AppRole,
} from '@/app/core/services/admin-management.service'

@Component({
  selector: 'app-roles-management',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './roles-management.component.html',
})
export class RolesManagementComponent implements OnInit {
  private adminService = inject(AdminManagementService)
  private fb = inject(FormBuilder)

  roles: AppRole[] = []
  actions: AppAction[] = []

  loading = false
  submitting = false
  error = ''

  roleForm = this.fb.group({
    name: ['', [Validators.required]],
    description: ['', [Validators.required]],
    actions: [[] as number[]],
  })

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

  onToggleAction(actionId: number, checked: boolean): void {
    const selected = [...(this.roleForm.value.actions || [])]
    const exists = selected.includes(actionId)

    if (checked && !exists) {
      selected.push(actionId)
    }

    if (!checked && exists) {
      const idx = selected.indexOf(actionId)
      selected.splice(idx, 1)
    }

    this.roleForm.patchValue({ actions: selected })
  }

  isActionChecked(actionId: number): boolean {
    return (this.roleForm.value.actions || []).includes(actionId)
  }

  submitRole(): void {
    if (this.roleForm.invalid) {
      this.roleForm.markAllAsTouched()
      return
    }

    this.submitting = true
    const payload = {
      name: (this.roleForm.value.name || '').trim(),
      description: (this.roleForm.value.description || '').trim(),
      actions: this.roleForm.value.actions || [],
    }

    this.adminService.createRole(payload).subscribe({
      next: () => {
        this.submitting = false
        this.roleForm.reset({ name: '', description: '', actions: [] })
        this.loadData()
      },
      error: (err) => {
        this.error = err?.error?.message || 'Unable to create role'
        this.submitting = false
      },
    })
  }

  getActionNames(actionIds?: number[]): string {
    if (!actionIds || actionIds.length === 0) return '-'

    return actionIds
      .map((id) => this.actions.find((a) => a._id === id)?.name || `#${id}`)
      .join(', ')
  }
}
