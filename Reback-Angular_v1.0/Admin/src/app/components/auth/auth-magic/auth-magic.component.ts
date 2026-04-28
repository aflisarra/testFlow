import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthMagicService } from '../../../core/services/auth.magic.service';

@Component({
  selector: 'app-auth-magic',
  templateUrl: './auth-magic.component.html',
  styleUrl: './auth-magic.component.scss'
})
export class AuthMagicComponent {
  step = 1; // 1: forgot, 2: OTP, 3: reset
  forgotForm: FormGroup;
  otpForm: FormGroup;
  resetForm: FormGroup;
  email: string;
  resetToken: string;

  constructor(
    private fb: FormBuilder,
    private authMagicService: AuthMagicService
  ) {
    this.forgotForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
    this.otpForm = this.fb.group({
      code: ['', [Validators.required, Validators.minLength(6)]]
    });
    this.resetForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(8)]]
    });
  }

  submitForgot() {
    this.email = this.forgotForm.value.email;
    this.authMagicService.forgotPassword(this.email).subscribe(
      (res) => {
        this.step = 2; // Passer à l'étape OTP
      },
      (err) => console.error(err)
    );
  }

  submitOTP() {
    const code = this.otpForm.value.code;
    this.authMagicService.verifyOTP(this.email, code).subscribe(
      (res) => {
        this.resetToken = res.resetToken;
        this.step = 3; // Passer à l'étape reset
      },
      (err) => console.error(err)
    );
  }

  submitReset() {
    const password = this.resetForm.value.password;
    this.authMagicService.resetPassword(this.resetToken, password).subscribe(
      (res) => {
        alert('Mot de passe réinitialisé !');
        // Rediriger vers login
      },
      (err) => console.error(err)
    );
  }
}