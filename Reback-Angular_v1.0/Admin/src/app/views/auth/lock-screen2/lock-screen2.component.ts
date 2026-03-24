import { LogoBoxComponent } from '@/app/components/logo-box.component'
import { Component } from '@angular/core'
import { RouterLink } from '@angular/router'

@Component({
  selector: 'app-lock-screen2',
  standalone: true,
  imports: [LogoBoxComponent, RouterLink],
  templateUrl: './lock-screen2.component.html',
  styles: ``,
})
export class LockScreen2Component {}
