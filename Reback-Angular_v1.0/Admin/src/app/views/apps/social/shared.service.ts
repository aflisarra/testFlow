import { Injectable } from '@angular/core'
import { BehaviorSubject } from 'rxjs'

@Injectable({
  providedIn: 'root',
})
export class SharedService {
  private activeTabSubject = new BehaviorSubject<string>('feed')
  activeTab$ = this.activeTabSubject.asObservable()

  setActiveTab(tab: string) {
    this.activeTabSubject.next(tab)
  }
}
