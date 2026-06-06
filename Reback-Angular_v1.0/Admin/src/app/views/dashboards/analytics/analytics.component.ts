import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgApexchartsModule } from 'ng-apexcharts';

import type { ChartOptions } from '@/app/common/apexchart.model';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  templateUrl: './analytics.component.html',
  styleUrls: ['./analytics.component.css'],
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
      labels: {
        formatter: (val: number) => `${Math.round(val)}`,
      },
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
  };
}