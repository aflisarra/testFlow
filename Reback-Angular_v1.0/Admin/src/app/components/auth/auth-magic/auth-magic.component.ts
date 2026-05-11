import { Component, inject } from '@angular/core'
import { FormBuilder, FormGroup, Validators } from '@angular/forms'
import { AuthMagicService } from '../../../core/services/auth.magic.service'
import { ReactiveFormsModule } from '@angular/forms'
@Component({
   standalone: true,
  imports: [ ReactiveFormsModule],
  selector: 'app-auth-magic',
  templateUrl: './auth-magic.component.html',
  styleUrl: './auth-magic.component.scss',
})
export class AuthMagicComponent {
  private fb = inject(FormBuilder)
  private authMagicService = inject(AuthMagicService)

  step = 1
  forgotForm: FormGroup
  otpForm: FormGroup
  resetForm: FormGroup

  email?: string
  resetToken?: string

  constructor() {
    this.forgotForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
    })

    this.otpForm = this.fb.group({
      code: ['', [Validators.required, Validators.minLength(6)]],
    })

    this.resetForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(8)]],
    })
  }

  submitForgot() {
    if (!this.email) this.email = this.forgotForm.value.email
    if (!this.email) return

    this.authMagicService.forgotPassword(this.email).subscribe({
      next: () => {
        this.step = 2
      },
      error: (err: unknown) => console.error(err),
    })
  }

  submitOTP() {
    const code = this.otpForm.value.code
    if (!this.email || !code) return

    this.authMagicService.verifyOtp(this.email, code).subscribe({
      next: (res: { resetToken: string }) => {
        this.resetToken = res.resetToken
        this.step = 3
      },
      error: (err: unknown) => console.error(err),
    })
  }

  submitReset() {
    const password = this.resetForm.value.password
    if (!this.resetToken || !password) return

    this.authMagicService.resetPassword(this.resetToken, password).subscribe({
      next: () => {
        this.step = 4
      },
      error: (err: unknown) => console.error(err),
    })
  }
}
