import type { ChartOptions } from '@/app/common/apexchart.model'
import { Component } from '@angular/core'
import { NgApexchartsModule } from 'ng-apexcharts'

@Component({
  selector: 'finance-expenses',
  standalone: true,
  imports: [NgApexchartsModule],
  templateUrl: './expenses.component.html',
  styles: ``,
})
export class ExpensesComponent {
  expenseChart: Partial<ChartOptions> = {
    series: [
      {
        name: '2024',
        data: [2.7, 2.2, 1.3, 2.5, 1, 2.5, 1.2, 1.2, 2.7, 1, 3.6, 2.1],
      },
      {
        name: '2023',
        data: [
          -2.3, -1.9, -1, -2.1, -1.3, -2.2, -1.1, -2.3, -2.8, -1.1, -2.5, -1.5,
        ],
      },
    ],
    chart: {
      toolbar: {
        show: false,
      },
      type: 'bar',
      fontFamily: 'inherit',
      foreColor: '#ADB0BB',
      height: 280,
      stacked: true,
      offsetX: -15,
    },
    colors: ['var(--bs-primary)', 'var(--bs-info)'],
    plotOptions: {
      bar: {
        horizontal: false,
        barHeight: '80%',
        columnWidth: '25%',
        borderRadiusApplication: 'end',
        borderRadiusWhenStacked: 'all',
      },
    },
    dataLabels: {
      enabled: false,
    },
    legend: {
      show: false,
    },
    grid: {
      show: true,
      strokeDashArray: 3,
      padding: {
        top: -10,
        right: 0,
        bottom: -10,
        left: 0,
      },
      borderColor: 'rgba(0,0,0,0.05)',
      xaxis: {
        lines: {
          show: true,
        },
      },
      yaxis: {
        lines: {
          show: false,
        },
      },
    },
    yaxis: {
      tickAmount: 4,
      labels: {
        formatter: function (val) {
          return val + 'k'
        },
      },
    },
    xaxis: {
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
      categories: [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'July',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ],
    },
  }
}
