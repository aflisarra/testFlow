import { PageTitleComponent } from '@/app/components/page-title.component'
import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'
import {
  CUSTOM_ELEMENTS_SCHEMA,
  Component,
  TemplateRef,
  inject,
} from '@angular/core'
import { NgbToastModule } from '@ng-bootstrap/ng-bootstrap'
import { ToastService } from './toast.service'
import { ToastsContainer } from './toasts-container.component'

@Component({
  selector: 'app-toastss',
  standalone: true,
  imports: [
    PageTitleComponent,
    NgbToastModule,
    UIExamplesListComponent,
    ToastsContainer,
  ],
  templateUrl: './toasts.component.html',
  styles: ``,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ToastsComponent {
  toastService = inject(ToastService)
  liveToast = false
  show = true
  show1 = true
  show2 = true
  show3 = true

  close() {
    this.show = false
  }

  showStandard() {
    this.toastService.show({
      content: 'See Just like this',
      delay: 10000,
      classname: 'standard',
    })
  }

  showSuccess() {
    this.toastService.show({
      content: 'Heads up, toasts will stack automatically',
      delay: 10000,
      classname: 'standard',
    })
  }
}
