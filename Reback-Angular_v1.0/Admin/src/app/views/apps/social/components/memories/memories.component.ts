import { Component } from '@angular/core'
import { RouterLink } from '@angular/router'
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'social-memories',
  standalone: true,
  imports: [NgbDropdownModule, RouterLink],
  templateUrl: './memories.component.html',
  styles: ``,
})
export class MemoriesComponent {}
