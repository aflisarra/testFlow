import {
  Component,
  inject,
  Renderer2,
  type OnDestroy,
  type OnInit,
} from '@angular/core'
import { RouterModule } from '@angular/router'

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [RouterModule],
  template: ` <div class="account-pages pt-2 pt-sm-5 pb-4 pb-sm-5">
    <div class="container">
      <router-outlet></router-outlet>
    </div>
  </div>`,
  styles: ``,
})
export class AuthLayoutComponent implements OnInit, OnDestroy {
  private renderer = inject(Renderer2)

  ngOnInit(): void {
    this.renderer.addClass(document.body, 'authentication-bg')
  }

  ngOnDestroy(): void {
    this.renderer.removeClass(document.body, 'authentication-bg')
  }
}
