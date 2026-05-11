import { LogoBoxComponent } from 'src/app/components/logo-box.component'
import { Component, inject, OnInit } from '@angular/core'
import { RouterLink, ActivatedRoute, Router } from '@angular/router'
import { AuthenticationService } from '../../../../app/core/services/auth.service'
import { FormsModule } from '@angular/forms'
import { CommonModule } from '@angular/common'

type Step = 'email' | 'otp' | 'new-password' | 'done'

@Component({
  selector: 'app-reset-pass',
  standalone: true,
  imports: [LogoBoxComponent, RouterLink, FormsModule, CommonModule],
  templateUrl: './reset-pass.component.html',
  styles: ``,
})
export class ResetPassComponent implements OnInit {

  private route = inject(ActivatedRoute)
  private router = inject(Router)
  private auth = inject(AuthenticationService)

  step: Step = 'email'
  email = ''
  otpCode = ''
  newPassword = ''
  resetToken = ''
  loading = false
  errorMsg = ''

 


  ngOnInit() {
    const token = this.route.snapshot.queryParams['token']
    if (token) {
      this.loading = true
      this.auth.verifyMagicToken(token).subscribe({
        next: (res) => {
          this.resetToken = res.resetToken
          this.step = 'new-password'
          this.loading = false
        },
        error: () => {
          this.errorMsg = 'Lien invalide ou expiré.'
          this.loading = false
        },
      })
    }
  }

  submitEmail() {
    if (!this.email) return
    this.loading = true
    this.errorMsg = ''
    this.auth.forgotPassword(this.email).subscribe({

      next: () => {
        this.step = 'otp'
        this.loading = false
      },

      error: () => {
        this.loading = false
      },
    })
  }

  submitOtp() {
    if (!this.otpCode) return
    this.loading = true
    this.errorMsg = ''
    this.auth.verifyOtp(this.email, this.otpCode).subscribe({
      next: (res) => {
        this.resetToken = res.resetToken
        this.step = 'new-password'
        this.loading = false
      },
      error: () => {
        this.errorMsg = 'Code incorrect ou expiré.'
        this.loading = false
      },
    })
  }

  submitNewPassword() {
    if (!this.newPassword) return
    this.loading = true
    this.errorMsg = ''
    this.auth.resetPassword(this.resetToken, this.newPassword).subscribe({
      next: () => {
        this.step = 'done'
        this.loading = false
        setTimeout(() => this.router.navigate(['/auth/sign-in']), 2000)
      },
      error: (err) => {
        this.errorMsg = err?.error?.message || 'Erreur, réessayez.'
        this.loading = false
      },
    })
  }
}
