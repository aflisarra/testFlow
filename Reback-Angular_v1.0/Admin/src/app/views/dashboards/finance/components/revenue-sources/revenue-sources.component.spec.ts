import { ComponentFixture, TestBed } from '@angular/core/testing'

import { RevenueSourcesComponent } from './revenue-sources.component'

describe('RevenueSourcesComponent', () => {
  let component: RevenueSourcesComponent
  let fixture: ComponentFixture<RevenueSourcesComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RevenueSourcesComponent],
    }).compileComponents()

    fixture = TestBed.createComponent(RevenueSourcesComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
