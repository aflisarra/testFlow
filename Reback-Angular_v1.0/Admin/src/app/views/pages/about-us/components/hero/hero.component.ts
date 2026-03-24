import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core'

@Component({
  selector: 'about-hero',
  standalone: true,
  imports: [],
  templateUrl: './hero.component.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class HeroComponent {}
