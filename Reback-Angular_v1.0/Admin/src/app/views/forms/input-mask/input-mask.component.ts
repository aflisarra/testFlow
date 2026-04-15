import { PageTitleComponent } from '@/app/components/page-title.component'
import { Component } from '@angular/core'
import { NgxMaskDirective, provideNgxMask } from 'ngx-mask'

@Component({
  selector: 'app-input-mask',
  standalone: true,
  imports: [PageTitleComponent, NgxMaskDirective],
  templateUrl: './input-mask.component.html',
  styles: ``,
  providers: [provideNgxMask()],
})
export class InputMaskComponent {}
