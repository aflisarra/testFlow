import { AuthenticationService } from '@/app/core/services/auth.service'
import { CommonModule } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, DestroyRef, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms'
import { Router } from '@angular/router'
import { ToastrService } from 'ngx-toastr'

function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const newPassword = group.get('newPassword')?.value
  const confirmPassword = group.get('confirmPassword')?.value
  return newPassword && confirmPassword && newPassword !== confirmPassword
    ? { passwordsMismatch: true }
    : null
}

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.css',
})
export class ChangePasswordComponent {
  private fb = inject(FormBuilder)
  private authService = inject(AuthenticationService)
  private toastr = inject(ToastrService)
  private router = inject(Router)
  private destroyRef = inject(DestroyRef)

  isSubmitting = false

  showCurrent = false
  showNew = false
  showConfirm = false

  form = this.fb.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator }
  )

  get f() {
    return this.form.controls
  }

  toggleVisibility(field: 'current' | 'new' | 'confirm') {
    if (field === 'current') this.showCurrent = !this.showCurrent
    if (field === 'new') this.showNew = !this.showNew
    if (field === 'confirm') this.showConfirm = !this.showConfirm
  }

  onSubmit(): void {
    if (this.form.invalid || this.isSubmitting) {
      this.form.markAllAsTouched()
      return
    }

    const { currentPassword, newPassword } = this.form.getRawValue()
    this.isSubmitting = true

    this.authService
      .changePassword(currentPassword!, newPassword!)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toastr.success('Your password has been updated.', 'Success')
          this.form.reset()
          this.isSubmitting = false
          this.router.navigate(['/'])
        },
        error: (err: unknown) => {
          const message =
            err instanceof HttpErrorResponse
              ? (err.error as { message?: string })?.message || 'Unable to change password'
              : 'Unable to change password'
          this.toastr.error(message, 'Error')
          this.isSubmitting = false
        },
      })
  }

  onCancel(): void {
    this.router.navigate(['/'])
  }
}