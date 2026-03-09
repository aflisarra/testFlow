import type { ChartOptions } from '@/app/common/apexchart.model'
import { Component } from '@angular/core'
import { NgApexchartsModule } from 'ng-apexcharts'

@Component({
  selector: 'sales-overview',
  standalone: true,
  imports: [NgApexchartsModule],
  templateUrl: './overview.component.html',
  styles: ``,
})
export class OverviewComponent {
  overviewChart: Partial<ChartOptions> = {
    series: [
      {
        name: 'Revenue',
        type: 'area',
        data: [34, 65, 46, 68, 49, 61, 42, 44, 78, 52, 63, 67],
      },
      {
        name: 'Orders',
        type: 'line',
        data: [8, 12, 7, 17, 21, 11, 5, 9, 7, 29, 12, 35],
      },
    ],
    chart: {
      height: 369,
      type: 'line',
      toolbar: {
        show: false,
      },
    },
    stroke: {
      dashArray: [0, 8],
      width: [2, 2],
      curve: 'smooth',
    },
    fill: {
      opacity: [1, 1],
      type: ['gradient', 'solid'],
      gradient: {
        type: 'vertical',
        inverseColors: false,
        opacityFrom: 0.5,
        opacityTo: 0,
        stops: [0, 70],
      },
    },
    markers: {
      size: [0, 0, 0],
      strokeWidth: 2,
      hover: {
        size: 4,
      },
    },
    xaxis: {
      categories: [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ],
      axisTicks: {
        show: false,
      },
      axisBorder: {
        show: false,
      },
    },
    yaxis: {
      min: 0,
      labels: {
        formatter: function (val) {
          return val + 'k'
        },
      },
      axisBorder: {
        show: false,
      },
    },
    grid: {
      show: true,
      xaxis: {
        lines: {
          show: false,
        },
      },
      yaxis: {
        lines: {
          show: true,
        },
      },
      padding: {
        top: 0,
        right: -2,
        bottom: 15,
        left: 15,
      },
    },
    legend: {
      show: true,
      horizontalAlign: 'center',
      offsetX: 0,
      offsetY: 5,
      itemMargin: {
        horizontal: 10,
        vertical: 0,
      },
    },
    plotOptions: {
      bar: {
        columnWidth: '30%',
        barHeight: '70%',
        borderRadius: 3,
      },
    },
    colors: ['#7f56da', '#22c55e'],
    tooltip: {
      shared: true,
      y: [
        {
          formatter: function (y) {
            if (typeof y !== 'undefined') {
              return '$' + y.toFixed(2) + 'k'
            }
            return y
          },
        },
        {
          formatter: function (y) {
            if (typeof y !== 'undefined') {
              return '$' + y.toFixed(2) + 'k'
            }
            return y
          },
        },
      ],
    },
  }
}
