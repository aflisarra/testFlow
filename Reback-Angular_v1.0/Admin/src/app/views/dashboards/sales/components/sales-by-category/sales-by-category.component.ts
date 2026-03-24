import type { ChartOptions } from '@/app/common/apexchart.model'
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap'
import { NgApexchartsModule } from 'ng-apexcharts'

@Component({
  selector: 'sales-by-category',
  standalone: true,
  imports: [NgApexchartsModule, NgbDropdownModule],
  templateUrl: './sales-by-category.component.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class SalesByCategoryComponent {
  categoryChart: Partial<ChartOptions> = {
    chart: {
      height: 250,
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
          size: '80%',
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
    series: [140, 125, 85, 60],
    labels: ['Electronics', 'Grocery', 'Clothing', 'Other'],
    colors: ['#f9b931', '#ff86c8', '#4ecac2', '#7f56da'],
    dataLabels: {
      enabled: false,
    },
  }
}
