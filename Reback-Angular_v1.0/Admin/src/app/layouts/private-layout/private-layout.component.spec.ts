import { ComponentFixture, TestBed } from '@angular/core/testing'
import { appTestProviders } from '@/testing/app-test-providers'

import { PrivateLayoutComponent } from './private-layout.component'

describe('PrivateLayoutComponent', () => {
  let component: PrivateLayoutComponent
  let fixture: ComponentFixture<PrivateLayoutComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrivateLayoutComponent],
      providers: appTestProviders(),
    }).compileComponents()

    fixture = TestBed.createComponent(PrivateLayoutComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
