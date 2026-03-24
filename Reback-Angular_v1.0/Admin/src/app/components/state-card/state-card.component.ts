import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'

@Component({
  selector: 'state-card',
  standalone: true,
  imports: [],
  templateUrl: './state-card.component.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class StateCardComponent {
  stateData = [
    {
      icon: 'iconamoon:shopping-card-add-duotone',
      iconColor: 'info',
      amount: '59.6',
      title: 'Total Sales',
      badge: '8.72',
      badgeColor: 'success',
      badgeIcon: 'bx bx-doughnut-chart',
    },
    {
      icon: 'iconamoon:link-external-duotone',
      iconColor: 'success',
      amount: '24.03',
      title: 'Total Expenses',
      badge: '3.28',
      badgeColor: 'danger',
      badgeIcon: 'bx bx-bar-chart-alt-2',
    },
    {
      icon: 'iconamoon:store-duotone',
      iconColor: 'purple',
      amount: '48.7',
      title: 'Investments',
      badge: '5.69',
      badgeColor: 'danger',
      badgeIcon: 'bx bx-building-house',
    },
    {
      icon: 'iconamoon:gift-duotone',
      iconColor: 'orange',
      amount: '11.3',
      title: 'Profit',
      badge: '10.58',
      badgeColor: 'success',
      badgeIcon: 'bx bx-bowl-hot',
    },
    {
      icon: 'iconamoon:certificate-badge-duotone',
      iconColor: 'warning',
      amount: '5.06',
      title: 'Savings',
      badge: '8.72',
      badgeColor: 'success',
      badgeIcon: 'bx bx-cricket-ball',
    },
  ]
}
