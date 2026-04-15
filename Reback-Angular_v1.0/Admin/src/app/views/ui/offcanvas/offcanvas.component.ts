import { PageTitleComponent } from '@/app/components/page-title.component'
import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'
import { Component, TemplateRef, inject } from '@angular/core'
import { NgbDropdownModule, NgbOffcanvas } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-offcanvas',
  standalone: true,
  imports: [PageTitleComponent, NgbDropdownModule, UIExamplesListComponent],
  templateUrl: './offcanvas.component.html',
  styles: ``,
})
export class OffcanvasComponent {
  private offcanvasService = inject(NgbOffcanvas)

  openStart(content: TemplateRef<HTMLElement>) {
    this.offcanvasService.dismiss()
    this.offcanvasService.open(content, {
      position: 'start',
    })
  }

  openEnd(content: TemplateRef<HTMLElement>) {
    this.offcanvasService.open(content, { position: 'end' })
  }

  openTop(content: TemplateRef<HTMLElement>) {
    this.offcanvasService.open(content, { position: 'top' })
  }

  openBottom(content: TemplateRef<HTMLElement>) {
    this.offcanvasService.open(content, { position: 'bottom' })
  }

  openNoBackdrop(content: TemplateRef<HTMLElement>) {
    this.offcanvasService.open(content, { backdrop: false })
  }

  openDark(content: TemplateRef<HTMLElement>) {
    this.offcanvasService.open(content, {
      position: 'start',
      panelClass: 'bg-dark text-white',
    })
  }

  openScroll(scroll: TemplateRef<any>) {
    this.offcanvasService.open(scroll, { scroll: true })
  }
}
