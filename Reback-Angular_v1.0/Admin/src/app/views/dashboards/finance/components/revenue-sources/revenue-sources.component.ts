import type { ChartOptions } from '@/app/common/apexchart.model'
import { currency } from '@/app/common/constants'
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap'
import { NgApexchartsModule } from 'ng-apexcharts'

@Component({
  selector: 'finance-revenue-sources',
  standalone: true,
  imports: [NgApexchartsModule, NgbDropdownModule],
  templateUrl: './revenue-sources.component.html',
  styles: ``,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class RevenueSourcesComponent {
  currency = currency

  revenueSourceChart: Partial<ChartOptions> = {
    chart: {
      height: 205,
      type: 'donut',
    },
    legend: {
      show: false,
      position: 'bottom',
      horizontalAlign: 'center',
      offsetX: 0,
      offsetY: -5,
      itemMargin: {
        horizontal: 10,
        vertical: 0,
      },
    },
    stroke: {
      width: 0,
    },
    plotOptions: {
      pie: {
        donut: {
          size: '70%',
          labels: {
            show: true,
            total: {
              showAlways: true,
              show: true,
            },
          },
        },
      },
    },
    series: [140, 125, 85],
    labels: ['Online', 'Offline', 'Direct'],
    colors: ['var(--bs-primary)', 'var(--bs-info)', 'var(--bs-light)'],
    dataLabels: {
      enabled: false,
    },
  }
}
