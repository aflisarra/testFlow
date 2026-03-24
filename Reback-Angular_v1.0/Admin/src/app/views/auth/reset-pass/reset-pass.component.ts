import { LogoBoxComponent } from '@/app/components/logo-box.component'
import { Component } from '@angular/core'
import { RouterLink } from '@angular/router'

@Component({
  selector: 'app-reset-pass',
  standalone: true,
  imports: [LogoBoxComponent, RouterLink],
  templateUrl: './reset-pass.component.html',
  styles: ``,
})
export class ResetPassComponent {}
