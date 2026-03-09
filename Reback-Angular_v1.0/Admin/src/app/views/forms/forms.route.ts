import type { Route } from '@angular/router'
import { BasicComponent } from './basic/basic.component'
import { CheckboxComponent } from './checkbox/checkbox.component'
import { SelectComponent } from './select/select.component'
import { FlatPickerComponent } from './flat-picker/flat-picker.component'
import { ValidationComponent } from './validation/validation.component'
import { WizardComponent } from './wizard/wizard.component'
import { FileUploadsComponent } from './file-uploads/file-uploads.component'
import { EditorsComponent } from './editors/editors.component'
import { InputMaskComponent } from './input-mask/input-mask.component'
import { SliderComponent } from './slider/slider.component'
import { ClipboardComponent } from './clipboard/clipboard.component'

export const FOMRS_ROUTE: Route[] = [
  {
    path: 'basic',
    component: BasicComponent,
    data: { title: 'Form Basic' },
  },
  {
    path: 'checkbox',
    component: CheckboxComponent,
    data: { title: 'Checkbox & Radio' },
  },
  {
    path: 'clipboard',
    component: ClipboardComponent,
    data: { title: 'Clipboard' },
  },
  {
    path: 'select',
    component: SelectComponent,
    data: { title: 'Form Select' },
  },
  {
    path: 'flat-picker',
    component: FlatPickerComponent,
    data: { title: 'Flatpicker' },
  },
  {
    path: 'validation',
    component: ValidationComponent,
    data: { title: 'Form Validation' },
  },
  {
    path: 'wizard',
    component: WizardComponent,
    data: { title: 'Wizard' },
  },
  {
    path: 'file-uploads',
    component: FileUploadsComponent,
    data: { title: 'File Uploads' },
  },
  {
    path: 'editors',
    component: EditorsComponent,
    data: { title: 'Editors' },
  },
  {
    path: 'input-mask',
    component: InputMaskComponent,
    data: { title: 'Input Mask' },
  },
  {
    path: 'slider',
    component: SliderComponent,
    data: { title: 'Range Slider' },
  },
]
