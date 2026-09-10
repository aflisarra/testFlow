/// <reference types="@angular/localize" />

import { bootstrapApplication } from '@angular/platform-browser'
import { icons as iconamoonIcons } from '@iconify-json/iconamoon/index.js'
import { addCollection } from '@iconify/iconify'
import 'iconify-icon'
import { AppComponent } from './app/app.component'
import { appConfig } from './app/app.config'

addCollection(iconamoonIcons)

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err))
