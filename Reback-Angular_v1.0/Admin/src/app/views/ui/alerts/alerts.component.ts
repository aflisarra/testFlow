import { PageTitleComponent } from '@/app/components/page-title.component'
import { Component } from '@angular/core'
import { NgbAlertModule } from '@ng-bootstrap/ng-bootstrap'
import { AlertType, alert } from './data'
import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'

@Component({
  selector: 'app-alerts',
  standalone: true,
  imports: [PageTitleComponent, NgbAlertModule, UIExamplesListComponent],
  templateUrl: './alerts.component.html',
  styles: ``,
})
export class AlertsComponent {
  alertData: AlertType[] = alert

  close(index: number) {
    this.alertData.splice(index, 1)
  }
}
