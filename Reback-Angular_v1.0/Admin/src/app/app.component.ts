import { Component, DestroyRef, inject, ViewChild, OnInit } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { CommonModule } from '@angular/common'
import { Router, RouterOutlet, Event, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router'
import { TitleService } from '@core/services/title.service'
import { NgProgressbar, NgProgressRef } from 'ngx-progressbar'
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NgProgressbar],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit {
  @ViewChild(NgProgressRef, { static: true }) progressBar!: NgProgressRef
  private titleService = inject(TitleService)
  private router = inject(Router)
  private destroyRef = inject(DestroyRef)

  ngOnInit(): void {
    this.titleService.init()

    this.router.events
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event: Event) => {
        this.checkRouteChange(event)
      })
  }

  checkRouteChange(routerEvent: Event): void {
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
