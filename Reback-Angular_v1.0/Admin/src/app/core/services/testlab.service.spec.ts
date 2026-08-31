import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'

import type {
  GeneratePlanResponse,
  RoleReviewQueueResponse,
  SpecItemsResponse,
} from '@/app/interfaces/testlab.interface'
import { TestLabService } from './testlab.service'

describe('TestLabService owned specification-review API', () => {
  const apiUrl = 'http://localhost:3000'
  let service: TestLabService
  let http: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TestLabService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    })

    service = TestBed.inject(TestLabService)
    http = TestBed.inject(HttpTestingController)
  })

  afterEach(() => http.verify())

  it('posts a new specification to the public Node suite route', () => {
    const form = new FormData()
    form.append('file', new Blob(['spec']), 'spec.docx')
    let result: unknown

    service.ingestSpecification(form).subscribe((response) => result = response)

    const request = http.expectOne(`${apiUrl}/api/testsuites/ingest-spec`)
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toBe(form)
    request.flush({ testSuiteId: 'suite-1', pendingReviewCount: 2 })
    expect(result).toEqual({ testSuiteId: 'suite-1', pendingReviewCount: 2 })
  })

  it('posts a replacement specification to its suite-scoped route', () => {
    const form = new FormData()
    service.ingestSpecification(form, 'suite-1').subscribe()

    const request = http.expectOne(`${apiUrl}/api/testsuites/suite-1/ingest-spec`)
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toBe(form)
    request.flush({ testSuiteId: 'suite-1', pendingReviewCount: 0 })
  })

  it('generates plans from the already-ingested suite', () => {
    const response: GeneratePlanResponse = {
      testSuiteId: 'suite-1',
      pendingReviewCount: 1,
      testPlans: [],
    }
    service.generateStoredPlan('suite-1', { regenerate: true }).subscribe((value) => {
      expect(value).toEqual(response)
    })

    const request = http.expectOne(`${apiUrl}/api/testsuites/suite-1/generate-plan`)
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toEqual({ regenerate: true })
    request.flush(response)
  })

  it('lists the pending role-review queue through Node', () => {
    const response: RoleReviewQueueResponse = {
      specHash: 'hash',
      pendingCount: 1,
      items: [{
        itemId: 'ITEM-1',
        text: 'A reviewer classifies this item',
        headingPath: ['Users', 'Permissions'],
        nearestHeading: 'Permissions',
        suggestedRole: null,
      }],
    }
    service.getRoleReviews('suite-1').subscribe((value) => expect(value).toEqual(response))

    const request = http.expectOne(`${apiUrl}/api/testsuites/suite-1/role-reviews`)
    expect(request.request.method).toBe('GET')
    request.flush(response)
  })

  it('patches the selected human role to the suite review item', () => {
    service.resolveRoleReview('suite-1', 'ITEM-1', 'ACTOR').subscribe()

    const request = http.expectOne(`${apiUrl}/api/testsuites/suite-1/role-reviews/ITEM-1`)
    expect(request.request.method).toBe('PATCH')
    expect(request.request.body).toEqual({ role: 'ACTOR' })
    request.flush({
      item: {
        itemId: 'ITEM-1',
        text: 'An actor',
        headingPath: [],
        nearestHeading: null,
        suggestedRole: null,
        role: 'ACTOR',
        roleMethod: 'human',
        reviewed: true,
        reviewState: 'resolved',
      },
      pendingCount: 0,
    })
  })

  it('dismisses an item without calling an internal or FastAPI route', () => {
    service.dismissRoleReview('suite-1', 'ITEM-2').subscribe()

    const request = http.expectOne(`${apiUrl}/api/testsuites/suite-1/role-reviews/ITEM-2`)
    expect(request.request.method).toBe('DELETE')
    request.flush(null)
  })

  it('lists all classified specification items through the suite facade', () => {
    const response: SpecItemsResponse = {
      specHash: 'hash',
      totalCount: 0,
      items: [],
    }
    service.getSpecItems('suite-1').subscribe((value) => expect(value).toEqual(response))

    const request = http.expectOne(`${apiUrl}/api/testsuites/suite-1/spec-items`)
    expect(request.request.method).toBe('GET')
    request.flush(response)
  })
})
