import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'
import { CommonModule } from '@angular/common'
import { NgApexchartsModule } from 'ng-apexcharts'

import type { ChartOptions } from '@/app/common/apexchart.model'

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  templateUrl: './analytics.component.html',

  styles: `
    .ai-insight {
      border-radius: 0.75rem;
      padding: 0.9rem 1rem;
      border-left: 4px solid transparent;
    }

    .ai-insight-title {
      font-weight: 700;
      letter-spacing: 0.04em;
      font-size: 0.75rem;
      margin-bottom: 0.25rem;
    }

    .ai-insight-warning {
      border-left-color: var(--bs-warning);
      background: rgba(255, 193, 7, 0.1);
    }

    .ai-insight-warning .ai-insight-title {
      color: var(--bs-warning-text-emphasis);
    }

    .ai-insight-primary {
      border-left-color: var(--bs-primary);
      background: rgba(13, 110, 253, 0.08);
    }

    .ai-insight-primary .ai-insight-title {
      color: var(--bs-primary-text-emphasis);
    }

    .ai-insight-success {
      border-left-color: var(--bs-success);
      background: rgba(25, 135, 84, 0.08);
    }

    .ai-insight-success .ai-insight-title {
      color: var(--bs-success-text-emphasis);
    }
  `,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AnalyticsComponent {
  coverageHealthChart: Partial<ChartOptions> = {
    series: [
      {
        name: 'Test Success Rate %',
        data: [94, 95, 93, 97, 98, 97, 98.2],
      },
      {
        name: 'Coverage %',
        data: [82, 83, 85, 85, 88, 89, 91],
      },
    ],
    chart: {
      height: 320,
      type: 'line',
      toolbar: { show: false },
    },
    stroke: {
      width: [3, 3],
      curve: 'smooth',
      dashArray: [0, 6],
    },
    markers: {
      size: [5, 0],
      strokeWidth: 2,
      hover: { size: 6 },
    },
    fill: {
      type: ['gradient', 'solid'],
      opacity: [0.25, 0],
      gradient: {
        type: 'vertical',
        shadeIntensity: 0,
        opacityFrom: 0.25,
        opacityTo: 0,
        stops: [0, 90, 100],
      },
    },
    colors: ['#5b5ff5', '#22c55e'],
    xaxis: {
      categories: ['Oct 1', 'Oct 5', 'Oct 10', 'Oct 15', 'Oct 20', 'Oct 25', 'Oct 30'],
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      min: 80,
      max: 100,
      tickAmount: 5,
      labels: { formatter: (val: number) => `${Math.round(val)}` },
    },
    grid: {
      strokeDashArray: 3,
      padding: { left: 10, right: 10 },
    },
    legend: {
      position: 'bottom',
      horizontalAlign: 'center',
      offsetY: 8,
    },
    tooltip: {
      shared: true,
      y: {
        formatter: (val: number) => `${val}%`,
      },
    },
  }
}
