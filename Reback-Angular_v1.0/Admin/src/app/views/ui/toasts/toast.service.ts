import { Injectable, TemplateRef } from '@angular/core'
import { SafeHtml } from '@angular/platform-browser'

export type Toast = {
  template?: TemplateRef<any>
  content?: string
  classname?: string
  delay?: number
  textOrTpl?: string
  header?: SafeHtml | string
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  toasts: Toast[] = []

  show(toast: Toast) {
    this.toasts.push(toast)
  }

  remove(toast: Toast) {
    this.toasts = this.toasts.filter((t) => t !== toast)
  }
}
