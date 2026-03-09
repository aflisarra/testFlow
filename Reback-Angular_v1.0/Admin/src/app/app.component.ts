import { Component, inject, ViewChild, type OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterOutlet,
  type Event,
} from '@angular/router'
import { TitleService } from '@core/services/title.service'
import { NgProgressbar, NgProgressRef } from 'ngx-progressbar'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NgProgressbar],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  @ViewChild(NgProgressRef) progressBar!: NgProgressRef

  private titleService = inject(TitleService)
  private router = inject(Router)

  constructor() {
    this.router.events.subscribe((event: Event) => {
      this.checkRouteChange(event)
    })
  }

  ngOnInit(): void {
    this.titleService.init()
  }

  // show Loader when route change
  checkRouteChange(routerEvent: Event) {
    if (routerEvent instanceof NavigationStart) {
      this.progressBar.start()
    }
    if (
      routerEvent instanceof NavigationEnd ||
      routerEvent instanceof NavigationCancel ||
      routerEvent instanceof NavigationError
    ) {
      setTimeout(() => {
        this.progressBar.complete()
      }, 200)
    }
  }
}
