import { PageTitleComponent } from '@/app/components/page-title.component'
import { Component } from '@angular/core'
import { RouterLink } from '@angular/router'

@Component({
  selector: 'app-error-404-alt',
  standalone: true,
  imports: [PageTitleComponent, RouterLink],
  templateUrl: './error-404-alt.component.html',
  styles: ``,
})
export class Error404AltComponent {}
