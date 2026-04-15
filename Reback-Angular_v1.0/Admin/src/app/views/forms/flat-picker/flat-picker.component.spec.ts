import { ComponentFixture, TestBed } from '@angular/core/testing'

import { FlatPickerComponent } from './flat-picker.component'

describe('FlatPickerComponent', () => {
  let component: FlatPickerComponent
  let fixture: ComponentFixture<FlatPickerComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlatPickerComponent],
    }).compileComponents()

    fixture = TestBed.createComponent(FlatPickerComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
