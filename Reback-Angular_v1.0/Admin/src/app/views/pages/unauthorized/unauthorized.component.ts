import { CommonModule } from '@angular/common'
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'
import { RouterModule } from '@angular/router'

import { PageTitleComponent } from '@/app/components/page-title.component'

@Component({
  selector: 'app-unauthorized',
  standalone: true,
  imports: [CommonModule, RouterModule, PageTitleComponent],
  templateUrl: './unauthorized.component.html',
  styleUrls: ['./unauthorized.component.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class UnauthorizedComponent {}
