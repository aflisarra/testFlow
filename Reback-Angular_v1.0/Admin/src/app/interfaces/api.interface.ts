import type { HttpContext, HttpHeaders, HttpParams } from '@angular/common/http'

type ApiPrimitive = string | number | boolean
type ApiParamsRecord = Record<string, ApiPrimitive | readonly ApiPrimitive[]>

export interface ApiOptions {
  headers?: HttpHeaders | Record<string, string | string[]>
  params?: HttpParams | ApiParamsRecord
  context?: HttpContext
  withCredentials?: boolean
  reportProgress?: boolean
}

