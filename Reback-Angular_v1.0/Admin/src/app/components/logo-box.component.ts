import { CommonModule } from '@angular/common'
import { Component, Input } from '@angular/core'

@Component({
  selector: 'app-logo-box',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div [class]="className">
      <a href="index.html" class="logo-dark">
        <img
          src="assets/images/logo-sm.png"
          [ngClass]="className === 'logo-box' ? 'logo-sm' : 'me-1'"
          [height]="logoHeight"
          alt="logo sm"
        />
        <img
          src="assets/images/logo-dark.png"
          [ngClass]="className === 'logo-box' ? 'logo-lg' : ''"
          [height]="height"
          alt="logo dark"
        />
      </a>

      <a href="index.html" class="logo-light">
        <img
          src="assets/images/logo-sm.png"
          [ngClass]="className === 'logo-box' ? 'logo-sm' : 'me-1'"
          [height]="logoHeight"
          alt="logo sm"
        />
        <img
          src="assets/images/logo-light.png"
          [ngClass]="className === 'logo-box' ? 'logo-lg' : ''"
          [height]="height"
          alt="logo light"
        />
      </a>
    </div>
  `,
})
export class LogoBoxComponent {
  @Input() className = '';
  @Input() height = '60';
  @Input() logoHeight = '40';
}
