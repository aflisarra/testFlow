import { CommonModule } from '@angular/common'
import { Component, Input, OnInit, inject } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import {
  AdminManagementService,
  AppAction,
  AppRole,
} from '@/app/core/services/admin-management.service'
import { map, type Observable } from 'rxjs'

@Component({
  selector: 'app-role-upsert-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './role-upsert-modal.component.html',
})
export class RoleUpsertModalComponent implements OnInit {
  private fb = inject(FormBuilder)
  private adminService = inject(AdminManagementService)

  @Input() role: AppRole | null = null
  @Input() actions: AppAction[] = []

  submitting = false
  error = ''

  roleForm = this.fb.group({
    name: ['', [Validators.required]],
    description: ['', [Validators.required]],
    actions: [[] as number[]],
  })

  constructor(public activeModal: NgbActiveModal) {}

  ngOnInit(): void {
    if (this.role) {
      this.roleForm.patchValue({
        name: this.role.name,
        description: this.role.description,
        actions: this.role.actions || [],
      })
    }
  }

  get selectedCount(): number {
    return (this.roleForm.value.actions || []).length
  }

  get allSelected(): boolean {
    const total = this.actions.length
    if (total === 0) return false
    return this.selectedCount === total
  }

  toggleAll(checked: boolean): void {
    if (checked) {
      this.roleForm.patchValue({ actions: (this.actions || []).map((a) => a._id) })
      return
    }
    this.roleForm.patchValue({ actions: [] })
  }

  onToggleAction(actionId: number, checked: boolean): void {
    const selected = [...(this.roleForm.value.actions || [])]
    const exists = selected.includes(actionId)

    if (checked && !exists) selected.push(actionId)
    if (!checked && exists) selected.splice(selected.indexOf(actionId), 1)

    this.roleForm.patchValue({ actions: selected })
  }

  isActionChecked(actionId: number): boolean {
    return (this.roleForm.value.actions || []).includes(actionId)
  }

  save(): void {
    if (this.roleForm.invalid) {
      this.roleForm.markAllAsTouched()
      return
    }

    this.submitting = true
    this.error = ''

    const payload = {
      name: String(this.roleForm.value.name || '').trim(),
      description: String(this.roleForm.value.description || '').trim(),
      actions: this.roleForm.value.actions || [],
    }

    const request$: Observable<unknown> = this.role
      ? this.adminService.updateRole(this.role._id, payload).pipe(map(() => true))
      : this.adminService.createRole(payload).pipe(map(() => true))

    request$.subscribe({
      next: () => {
        this.submitting = false
        this.activeModal.close(true)
      },
      error: (err: unknown) => {
        this.submitting = false
        this.error = (err as any)?.error?.message || 'Unable to save role'
      },
    })
  }
}
