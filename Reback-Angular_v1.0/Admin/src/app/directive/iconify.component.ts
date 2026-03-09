import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  Input,
  ViewChild,
  ElementRef,
  type AfterViewInit,
} from '@angular/core'
import { getIcon, loadIcon, buildIcon } from 'iconify-icon'
import { getIconData, iconToSVG, iconToHTML, replaceIDs } from '@iconify/utils'

@Component({
  selector: 'ng-iconify',
  standalone: true,
  imports: [],
  template: `<template #iconTemplate></template>`,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  styles: `
    :host(ng-iconify) {
      display: contents;
    }
  `,
})
export class IconifyComponent implements AfterViewInit {
  @Input() icon: string = ''
  @ViewChild('iconTemplate') iconTemplate!: ElementRef

  svg = ''

  ngAfterViewInit(): void {
    const builtIcon = buildIcon(getIcon(this.icon))
    this.svg = iconToHTML(builtIcon.body, builtIcon.attributes)
    this.iconTemplate.nativeElement.innerHTML = this.svg
  }

  ngOnInit(): void {}
}
