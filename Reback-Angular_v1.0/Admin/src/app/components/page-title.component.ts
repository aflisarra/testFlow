import { Component, Input } from '@angular/core'

@Component({
  selector: 'app-page-title',
  standalone: true,
  template: `
    <div class="row">
      <div class="col-12">
        <div class="page-title-box">
          <h4 class="mb-0 fw-semibold">{{ subtitle }}</h4>
          <ol class="breadcrumb mb-0">
            <li class="breadcrumb-item">
              <a href="javascript: void(0);">{{ title }}</a>
            </li>
            <li class="breadcrumb-item active">{{ subtitle }}</li>
          </ol>
        </div>
      </div>
    </div>
  `,
})
export class PageTitleComponent {
  @Input() title: string = ''
  @Input() subtitle: string = ''
}
