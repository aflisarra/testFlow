import { PageTitleComponent } from '@/app/components/page-title.component'
import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'
import { Component, TemplateRef, inject } from '@angular/core'
import {
  NgbModal,
  NgbModalConfig,
  NgbModalModule,
  NgbModalOptions,
} from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-modals',
  standalone: true,
  imports: [PageTitleComponent, NgbModalModule, UIExamplesListComponent],
  templateUrl: './modals.component.html',
  styles: ``,
  providers: [NgbModalConfig, NgbModal],
})
export class ModalsComponent {
  private modalService = inject(NgbModal)
  constructor(config: NgbModalConfig) {
    config.backdrop = 'static'
    config.keyboard = false
  }

  staticBackdrop(content: TemplateRef<any>) {
    this.modalService.open(content)
  }

  open(content: TemplateRef<any>) {
    this.modalService.open(content)
  }

  openModal(content: TemplateRef<HTMLElement>, options: NgbModalOptions) {
    this.modalService.open(content, options)
  }
}
