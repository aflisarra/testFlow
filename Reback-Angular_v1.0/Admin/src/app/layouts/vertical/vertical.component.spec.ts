import { ComponentFixture, TestBed } from '@angular/core/testing'
import { appTestProviders } from '@/testing/app-test-providers'

import { VerticalComponent } from './vertical.component'

describe('VerticalComponent', () => {
  let component: VerticalComponent
  let fixture: ComponentFixture<VerticalComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VerticalComponent],
      providers: appTestProviders(),
    }).compileComponents()

    fixture = TestBed.createComponent(VerticalComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
