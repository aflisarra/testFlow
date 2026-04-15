import { LogoBoxComponent } from '@/app/components/logo-box.component'
import { Component } from '@angular/core'
import { RouterLink } from '@angular/router'

@Component({
  selector: 'app-error-404-2',
  standalone: true,
  imports: [LogoBoxComponent, RouterLink],
  templateUrl: './error-404-2.component.html',
  styles: ``,
})
export class Error4042Component {}
