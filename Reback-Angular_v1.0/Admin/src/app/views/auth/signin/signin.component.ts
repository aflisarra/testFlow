import { LogoBoxComponent } from '@/app/components/logo-box.component'
import { login } from '@/app/store/authentication/authentication.actions'
import { Component, inject, type OnInit } from '@angular/core'
import { AuthenticationService } from '../../../../app/core/services/auth.service';
import {
  FormsModule,
  ReactiveFormsModule,
  UntypedFormBuilder,
  Validators,
  type UntypedFormGroup,
} from '@angular/forms'
import { Router, RouterModule } from '@angular/router'
import { Store } from '@ngrx/store'

@Component({
  selector: 'app-signin',
  standalone: true,
  imports: [
    LogoBoxComponent,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
  ],
  templateUrl: './signin.component.html',
  styles: ``,
})
export class SigninComponent implements OnInit {
  signInForm!: UntypedFormGroup
  submitted = false
isLoading = false
  public authService = inject(AuthenticationService);
  public fb = inject(UntypedFormBuilder)
  public store = inject(Store)
  public router = inject(Router)

  ngOnInit(): void {
    this.signInForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
    });
  }

  get formValues() {
    return this.signInForm.controls
  }

  login() {
    this.submitted = true;
    if (this.signInForm.invalid) {
      console.warn('❌ Form is invalid', this.signInForm.errors);
      return;
    }

    this.isLoading = true;
    const email = this.formValues['email'].value;
    const password = this.formValues['password'].value;

    console.log('🔐 Tentative de connexion avec:', { email, password });

    // Dispatch login action to store - NgRx effects will handle the API call
    this.store.dispatch(login({ email, password }));

    // Reset form and loading state after a short delay
    setTimeout(() => {
      this.isLoading = false;
      this.submitted = false;
    }, 500);
  }
}

