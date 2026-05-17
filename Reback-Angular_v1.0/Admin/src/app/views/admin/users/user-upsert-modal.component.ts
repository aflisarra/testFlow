import {
    AdminManagementService,
} from '@/app/core/services/admin-management.service'
import type { AppRole, AppUser } from '@/app/interfaces/admin-management.interface'
import { CommonModule } from '@angular/common'
import { Component, CUSTOM_ELEMENTS_SCHEMA, HostListener, inject, Input, OnInit } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-user-upsert-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './user-upsert-modal.component.html',
  styleUrls: ['./user-upsert-modal.component.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class UserUpsertModalComponent implements OnInit {
  private fb = inject(FormBuilder)
  private adminService = inject(AdminManagementService)
  public activeModal = inject(NgbActiveModal)

  @Input() user: AppUser | null = null
  @Input() roles: AppRole[] = []

  submitting = false
  error = ''
  roleOpen = false

  userForm = this.fb.group({
    name: ['', [Validators.required, Validators.pattern(/\S+/)]],
    email: ['', [Validators.required, Validators.email]],
    role: ['', [Validators.required, Validators.pattern(/\S+/)]],
    description: [''],
  })

  ngOnInit(): void {
    if (this.user) {
      this.userForm.patchValue({
        name: this.user.name,
        email: this.user.email,
        role: this.user.role,
        description: this.user.description || '',
      })
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement
    if (!target.closest('.exec-role-dropdown')) {
      this.roleOpen = false
    }
  }

  getSelectedRoleLabel(): string {
    return String(this.userForm.value.role || '').trim()
  }

  selectRole(roleName: string): void {
    this.userForm.patchValue({ role: roleName })
    this.userForm.controls.role.markAsTouched()
    this.roleOpen = false
  }

  save(): void {
    if (!this.user) return

    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched()
      return
    }

    this.submitting = true
    this.error = ''

    const payload = {
      name: String(this.userForm.value.name || '').trim(),
      email: String(this.userForm.value.email || '').trim(),
      role: String(this.userForm.value.role || '').trim(),
      description:
        String(this.userForm.value.description || '').trim() || undefined,
    }

    this.adminService.updateUser(this.user._id, payload).subscribe({
      next: () => {
        this.submitting = false
        this.activeModal.close(true)
      },
      error: (err) => {
        this.submitting = false
        this.error = err?.error?.message || 'Unable to update user'
      },
    })
  }

  //editRoleOpen = false

/*selectEditRole(roleName: string): void {
  this.editUserForm.patchValue({
    role: roleName
  })

  this.editUserForm.controls.role.markAsTouched()
  this.editRoleOpen = false
}

getSelectedEditRoleLabel(): string {
  return this.editUserForm.value.role || ''
}*/
}
