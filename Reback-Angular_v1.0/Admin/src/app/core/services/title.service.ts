import { Injectable, inject } from '@angular/core'
import { Title } from '@angular/platform-browser'
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router'
import { filter } from 'rxjs/operators'

@Injectable({
  providedIn: 'root',
})
export class TitleService {
  private titleService = inject(Title)
  private router = inject(Router)
  private activatedRoute = inject(ActivatedRoute)

  init(): void {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        this.updateTitle()
      })
  }

  private updateTitle(): void {
    let route: ActivatedRoute = this.activatedRoute

    while (route.firstChild) {
      route = route.firstChild
    }

    const title = route.snapshot.data?.['title']

    if (typeof title === 'string') {
      this.titleService.setTitle(
        `${title} | Reback - Responsive Angular Admin Dashboard Template`
      )
    }
  }
}