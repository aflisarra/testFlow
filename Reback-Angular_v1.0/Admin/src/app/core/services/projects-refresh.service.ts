import { Injectable } from '@angular/core'
import { Observable, Subject } from 'rxjs'

@Injectable({ providedIn: 'root' })
export class ProjectsRefreshService {
  private readonly subject = new Subject<void>()
  readonly changes$: Observable<void> = this.subject.asObservable()

  notify(): void {
    this.subject.next()
  }
}

