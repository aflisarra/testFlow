import { PageTitleComponent } from '@/app/components/page-title.component'
import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core'

@Component({
  selector: 'app-iconamoon',
  standalone: true,
  imports: [PageTitleComponent],
  templateUrl: './iconamoon.component.html',
  styles: ``,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class IconamoonComponent {}
