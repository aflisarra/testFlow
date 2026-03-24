import { HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { ToastrService } from 'ngx-toastr'
import { Observable, throwError } from 'rxjs'
import { catchError } from 'rxjs/operators'

let lastForbiddenToastAt = 0

@Injectable()
export class ForbiddenInterceptor implements HttpInterceptor {
  private toastr = inject(ToastrService)

  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    return next.handle(request).pipe(
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 403) {
          const now = Date.now()
          if (now - lastForbiddenToastAt > 1500) {
            lastForbiddenToastAt = now
            const message =
              (typeof err.error === 'object' && (err.error as any)?.message) ||
              "Vous n'avez pas l'acces a ca"
            this.toastr.warning(message, 'Acces refuse', { timeOut: 2500 })
          }
        }
        return throwError(() => err)
      })
    )
  }
}

