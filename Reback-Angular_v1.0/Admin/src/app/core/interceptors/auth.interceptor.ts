import {
    HttpEvent,
    HttpHandler,
    HttpInterceptor,
    HttpRequest,
} from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { Observable } from 'rxjs'
import { AuthenticationService } from '../services/auth.service'

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private authService = inject(AuthenticationService)

  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    // Get token from auth service
    const token = this.authService.session

    // If token exists, add it to request headers
    if (token) {
      request = request.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      })
    }

    return next.handle(request)
  }
}
