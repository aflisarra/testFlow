import { LogoBoxComponent } from '@/app/components/logo-box.component'
import { SocialBtnComponent } from '@/app/components/social-btn/social-btn.component'
import { Component } from '@angular/core'
import { RouterLink } from '@angular/router'

@Component({
  selector: 'app-signup2',
  standalone: true,
  imports: [SocialBtnComponent, LogoBoxComponent, RouterLink],
  templateUrl: './signup2.component.html',
  styles: ``,
})
export class Signup2Component {}
