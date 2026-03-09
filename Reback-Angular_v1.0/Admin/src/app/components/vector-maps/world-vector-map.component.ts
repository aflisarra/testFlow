import { AfterViewInit, Component, Input, OnDestroy } from '@angular/core'

declare global {
  interface Window {
    jsVectorMap?: any
  }
}

@Component({
  selector: 'app-world-vector-map',
  standalone: true,
  template:
    '<div [id]="mapId" [style.width]="width" [style.height]="height"></div>',
})
export class WorldVectorMapComponent implements AfterViewInit {
  @Input() width: string = ''
  @Input() height: string = ''
  @Input() options: Record<string, unknown> = {}
  @Input() type: string = ''
  @Input() mapId: string = 'map'

  constructor() {}

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    setTimeout(() => {
      new (window as Window).jsVectorMap({
        selector: '#' + this.mapId,
        map: this.type,
        ...this.options,
      })
    }, 200)
  }
}
