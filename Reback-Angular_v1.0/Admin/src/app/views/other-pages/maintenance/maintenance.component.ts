import { LogoBoxComponent } from '@/app/components/logo-box.component'
import { Component } from '@angular/core'
import { RouterLink } from '@angular/router'

@Component({
  selector: 'app-maintenance',
  standalone: true,
  imports: [LogoBoxComponent, RouterLink],
  templateUrl: './maintenance.component.html',
  styles: ``,
})
export class MaintenanceComponent {}
