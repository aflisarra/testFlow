import { Component } from '@angular/core'
import { ServiceData } from '../../data'

@Component({
  selector: 'about-service',
  standalone: true,
  imports: [],
  templateUrl: './service.component.html',
  styles: ``,
})
export class ServiceComponent {
  serviceList = ServiceData
}
