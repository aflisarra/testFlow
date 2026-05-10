import { Injectable, inject } from '@angular/core'
import { ToastrService } from 'ngx-toastr'

@Injectable({ providedIn: 'root' })
export class UINotificationService {
  private toastr = inject(ToastrService)

  accessDenied(message: string): void {
    this.toastr.warning(message, 'Permission', { timeOut: 2500 })
  }

  success(message: string): void {
    this.toastr.success(message, 'Success', { timeOut: 2500 })
  }
}

