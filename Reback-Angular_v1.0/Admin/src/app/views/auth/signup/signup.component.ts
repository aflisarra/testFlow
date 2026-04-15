import { LogoBoxComponent } from '@/app/components/logo-box.component'
import { SocialBtnComponent } from '@/app/components/social-btn/social-btn.component'
import { AuthenticationService, SignupRole } from '@/app/core/services/auth.service'
import { Component, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { Router, RouterLink } from '@angular/router'

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [SocialBtnComponent, LogoBoxComponent, RouterLink, ReactiveFormsModule, CommonModule],
  templateUrl: './signup.component.html',
  styles: ``,
})
export class SignupComponent {
  signupForm!: FormGroup
  loading = false
  submitted = false
  error = ''
  showPassword = false
  roles: SignupRole[] = []
  rolesLoading = false

  private fb = inject(FormBuilder)
  private authService = inject(AuthenticationService)
  private router = inject(Router)

  constructor() {
    this.initForm()
    this.loadRoles()
  }

  initForm() {
    this.signupForm = this.fb.group(
      {
        username: ['', [Validators.required, Validators.minLength(3)]],
        email: ['', [Validators.required, Validators.email]],
        role: ['', [Validators.required]],
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
        termsAccepted: [false, [Validators.requiredTrue]],
      },
      { validators: this.passwordMatchValidator }
    )
  }

  loadRoles() {
    this.rolesLoading = true
    this.authService.getSignupRoles().subscribe({
      next: (roles) => {
        this.roles = roles || []
        if (this.roles.length > 0) {
          const currentRole = String(this.signupForm.get('role')?.value || '').trim()
          const hasCurrent = this.roles.some((r) => r.name === currentRole)
          if (!hasCurrent) {
            this.signupForm.patchValue({ role: this.roles[0].name })
          }
        }
        this.rolesLoading = false
      },
      error: () => {
        // If roles can't be loaded, keep default "user" (backend will validate).
        this.rolesLoading = false
      },
    })
  }

  passwordMatchValidator(group: FormGroup): Record<string, unknown> | null {
    const password = group.get('password')?.value
    const confirmPassword = group.get('confirmPassword')?.value
    return password === confirmPassword ? null : { passwordMismatch: true }
  }

  get f() {
    return this.signupForm.controls
  }

  onSubmit() {
    this.submitted = true
    this.error = ''

    if (this.signupForm.invalid) {
      return
    }

    this.loading = true
    const { username, email, password, confirmPassword, role } = this.signupForm.value

    this.authService.register(username, email, password, confirmPassword, undefined, role).subscribe({
      next: () => {
        this.loading = false
        this.router.navigate(['/auth/sign-in'])
      },
      error: (error) => {
        this.error = error.error?.message || error.error?.error || 'Registration failed. Please try again.'
        this.loading = false
      },
    })
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword
  }
}
