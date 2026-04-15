import { Route } from '@angular/router'
import { RatingsComponent } from './ratings/ratings.component'
import { SweetalertComponent } from './sweetalert/sweetalert.component'
import { SwiperComponent } from './swiper/swiper.component'
import { ScrollbarComponent } from './scrollbar/scrollbar.component'
import { ToastifyComponent } from './toastify/toastify.component'

export const ADVANCED_ROUTES: Route[] = [
  {
    path: 'ratings',
    component: RatingsComponent,
    data: { title: 'Ratings' },
  },
  {
    path: 'alert',
    component: SweetalertComponent,
    data: { title: 'Sweet Alert' },
  },
  {
    path: 'swiper',
    component: SwiperComponent,
    data: { title: 'Swiper Slider' },
  },
  {
    path: 'scrollbar',
    component: ScrollbarComponent,
    data: { title: 'Scrollbar' },
  },
  {
    path: 'toastify',
    component: ToastifyComponent,
    data: { title: 'Toastify' },
  },
]
