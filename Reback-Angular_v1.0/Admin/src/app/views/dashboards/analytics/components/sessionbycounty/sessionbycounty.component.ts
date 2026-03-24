import { WorldVectorMapComponent } from '@/app/components/vector-maps/world-vector-map.component'
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'
import 'jsvectormap'
import 'jsvectormap/dist/maps/world.js'
import { countryList } from '../../data'
import {
  NgbDropdownModule,
  NgbProgressbarModule,
} from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'analytics-sessionbycounty',
  standalone: true,
  imports: [WorldVectorMapComponent, NgbProgressbarModule, NgbDropdownModule],
  templateUrl: './sessionbycounty.component.html',
  styles: ``,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class SessionbycountyComponent {
  countryList = countryList

  worldMapConfig = {
    map: 'world',
    selector: '#world-map-markers',
    zoomOnScroll: true,
    zoomButtons: false,
    markersSelectable: true,
    markers: [
      { name: 'Canada', coords: [56.1304, -106.3468] },
      { name: 'Brazil', coords: [-14.235, -51.9253] },
      { name: 'Russia', coords: [61, 105] },
      { name: 'China', coords: [35.8617, 104.1954] },
      { name: 'United States', coords: [37.0902, -95.7129] },
    ],
    markerStyle: {
      initial: { fill: '#7f56da' },
      selected: { fill: '#22c55e' },
    },
    labels: {
      markers: {
        render: (marker: any) => marker.name,
      },
    },
    regionStyle: {
      initial: {
        fill: 'rgba(169,183,197, 0.3)',
        fillOpacity: 1,
      },
    },
  }
}
