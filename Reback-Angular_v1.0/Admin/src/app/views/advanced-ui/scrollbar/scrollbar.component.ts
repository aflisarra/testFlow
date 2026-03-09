import { PageTitleComponent } from '@/app/components/page-title.component'
import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'
import { Component } from '@angular/core'
import { SimplebarAngularModule } from 'simplebar-angular'

@Component({
  selector: 'app-scrollbar',
  standalone: true,
  imports: [
    PageTitleComponent,
    SimplebarAngularModule,
    UIExamplesListComponent,
  ],
  templateUrl: './scrollbar.component.html',
  styles: ``,
})
export class ScrollbarComponent {}
