import { LogoBoxComponent } from '@/app/components/logo-box.component'
import { Component } from '@angular/core'
import { RouterLink } from '@angular/router'

@Component({
  selector: 'app-reset-pass2',
  standalone: true,
  imports: [LogoBoxComponent, RouterLink],
  templateUrl: './reset-pass2.component.html',
  styles: ``,
})
export class ResetPass2Component {}
