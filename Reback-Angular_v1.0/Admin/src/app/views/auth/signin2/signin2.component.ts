import { LogoBoxComponent } from '@/app/components/logo-box.component'
import { SocialBtnComponent } from '@/app/components/social-btn/social-btn.component'
import { login } from '@/app/store/authentication/authentication.actions'
import { Component, inject } from '@angular/core'
import {
  FormsModule,
  ReactiveFormsModule,
  UntypedFormBuilder,
  Validators,
  type UntypedFormGroup,
} from '@angular/forms'
import { RouterLink } from '@angular/router'
import { Store } from '@ngrx/store'

@Component({
  selector: 'app-signin2',
  standalone: true,
  imports: [
    SocialBtnComponent,
    LogoBoxComponent,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './signin2.component.html',
  styles: ``,
})
export class Signin2Component {
  signInForm!: UntypedFormGroup
  submitted: boolean = false

  public fb = inject(UntypedFormBuilder)
  public store = inject(Store)

  ngOnInit(): void {
    this.signInForm = this.fb.group({
      email: ['reback@techzaa.in', [Validators.required, Validators.email]],
      password: ['123456', [Validators.required]],
    })
  }

  get formValues() {
    return this.signInForm.controls
  }

  login() {
    this.submitted = true
    if (this.signInForm.valid) {
      const email = this.formValues['email'].value // Get the username from the form
      const password = this.formValues['password'].value // Get the password from the form

      // Login Api
      this.store.dispatch(login({ email: email, password: password }))
    }
  }
}
