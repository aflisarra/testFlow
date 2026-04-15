import { ChartOptions } from '@/app/common/apexchart.model'
import { PageTitleComponent } from '@/app/components/page-title.component'
import { UIExamplesListComponent } from '@/app/components/ui-examples-list/ui-examples-list.component'
import { Component } from '@angular/core'
import { NgApexchartsModule } from 'ng-apexcharts'

@Component({
  selector: 'app-polar',
  standalone: true,
  imports: [PageTitleComponent, NgApexchartsModule, UIExamplesListComponent],
  templateUrl: './polar.component.html',
  styles: ``,
})
export class PolarComponent {
  basicPolarChart: Partial<ChartOptions> = {
    series: [14, 23, 21, 17, 15, 10],
    chart: {
      height: 380,
      type: 'polarArea',
      toolbar: {
        show: false,
      },
    },
    stroke: {
      colors: ['#fff'],
    },
    fill: {
      opacity: 0.8,
    },
    labels: ['Vote A', 'Vote B', 'Vote C', 'Vote D', 'Vote E', 'Vote F'],
    legend: {
      position: 'bottom',
    },
    colors: ['#1c84ee', '#f9b931', '#4ecac2'],
    responsive: [
      {
        breakpoint: 480,
        options: {
          chart: {
            width: 200,
          },
          legend: {
            position: 'bottom',
          },
        },
      },
    ],
  }

  monochromePolarChart: Partial<ChartOptions> = {
    series: [42, 47, 52, 58, 65],
    chart: {
      height: 380,
      type: 'polarArea',
    },
    labels: ['Rose A', 'Rose B', 'Rose C', 'Rose D', 'Rose E'],
    fill: {
      opacity: 1,
    },
    stroke: {
      width: 1,
    },
    yaxis: {
      show: false,
    },
    legend: {
      position: 'bottom',
    },
    plotOptions: {
      polarArea: {
        rings: {
          strokeWidth: 0,
        },
        spokes: {
          strokeWidth: 0,
        },
      },
    },
    theme: {
      monochrome: {
        enabled: true,
        shadeTo: 'light',
        color: '#727cf5',
        shadeIntensity: 0.6,
      },
    },
  }
}
