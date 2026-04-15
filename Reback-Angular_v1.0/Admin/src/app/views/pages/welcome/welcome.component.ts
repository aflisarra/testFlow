import { Component } from '@angular/core'
import { PageTitleComponent } from '@/app/components/page-title.component'

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [PageTitleComponent],
  templateUrl: './welcome.component.html',
  styles: ``,
})
export class WelcomeComponent {}
