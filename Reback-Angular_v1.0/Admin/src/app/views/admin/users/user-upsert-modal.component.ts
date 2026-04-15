import { CommonModule } from '@angular/common'
import { Component, Input, OnInit, inject } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import {
  AdminManagementService,
  AppRole,
  AppUser,
} from '@/app/core/services/admin-management.service'

@Component({
  selector: 'app-user-upsert-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './user-upsert-modal.component.html',
  styleUrls: ['./user-upsert-modal.component.css'],
})
export class UserUpsertModalComponent implements OnInit {
  private fb = inject(FormBuilder)
  private adminService = inject(AdminManagementService)

  @Input() user: AppUser | null = null
  @Input() roles: AppRole[] = []

  submitting = false
  error = ''

  userForm = this.fb.group({
    name: ['', [Validators.required, Validators.pattern(/\S+/)]],
    email: ['', [Validators.required, Validators.email]],
    role: ['', [Validators.required, Validators.pattern(/\S+/)]],
    description: [''],
  })

  constructor(public activeModal: NgbActiveModal) {}

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
      description: String(this.userForm.value.description || '').trim() || undefined,
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
}
