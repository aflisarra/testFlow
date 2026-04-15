import { LogoBoxComponent } from '@/app/components/logo-box.component'
import calculateTimeToEvent from '@/app/helpers/countDown'
import { Component, type OnDestroy, type OnInit } from '@angular/core'
import { RouterLink } from '@angular/router'
import { interval, type Subscription } from 'rxjs'

@Component({
  selector: 'app-comingsoon',
  standalone: true,
  imports: [LogoBoxComponent, RouterLink],
  templateUrl: './comingsoon.component.html',
  styles: ``,
})
export class ComingsoonComponent implements OnInit, OnDestroy {
  _days?: number
  _hours?: number
  _minutes?: number
  _seconds?: number
  countdown: { days: number; hours: number; minutes: number; seconds: number } =
    {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    }
  private intervalSubscription!: Subscription

  ngOnInit(): void {
    this.countdown = calculateTimeToEvent()
    this.intervalSubscription = interval(1000).subscribe(() => {
      this.countdown = calculateTimeToEvent()
    })
  }

  ngOnDestroy(): void {
    this.intervalSubscription.unsubscribe()
  }
}
