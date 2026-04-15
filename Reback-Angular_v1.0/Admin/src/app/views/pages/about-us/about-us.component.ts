import { PageTitleComponent } from '@/app/components/page-title.component'
import { Component } from '@angular/core'
import { HeroComponent } from './components/hero/hero.component'
import { ServiceComponent } from './components/service/service.component'
import { TeamComponent } from './components/team/team.component'

@Component({
  selector: 'app-about-us',
  standalone: true,
  imports: [PageTitleComponent, HeroComponent, ServiceComponent, TeamComponent],
  templateUrl: './about-us.component.html',
  styles: ``,
})
export class AboutUsComponent {}
