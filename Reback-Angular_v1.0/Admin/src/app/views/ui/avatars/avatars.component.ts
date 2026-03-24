import { PageTitleComponent } from '@/app/components/page-title.component'
import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'
import { Component } from '@angular/core'

@Component({
  selector: 'app-avatars',
  standalone: true,
  imports: [PageTitleComponent, UIExamplesListComponent],
  templateUrl: './avatars.component.html',
  styles: ``,
})
export class AvatarsComponent {}
