/// <reference types="@angular/localize" />

import { bootstrapApplication } from '@angular/platform-browser'
import { appConfig } from './app/app.config'
import { AppComponent } from './app/app.component'
import 'iconify-icon'
import { addCollection } from '@iconify/iconify'
import { icons as iconamoonIcons } from '@iconify-json/iconamoon'

addCollection(iconamoonIcons)

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err))
