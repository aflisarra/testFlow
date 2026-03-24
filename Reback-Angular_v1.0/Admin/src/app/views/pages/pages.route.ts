import { Route } from '@angular/router'
import { AboutUsComponent } from './about-us/about-us.component'
import { ContactUsComponent } from './contact-us/contact-us.component'
import { FaqsComponent } from './faqs/faqs.component'
import { PricingComponent } from './pricing/pricing.component'
import { ProfileComponent } from './profile/profile.component'
import { TeamComponent } from './team/team.component'
import { TimelineComponent } from './timeline/timeline.component'
import { WelcomeComponent } from './welcome/welcome.component'
import { Error404AltComponent } from './error-404-alt/error-404-alt.component'

export const PAGES_ROUTES: Route[] = [
  {
    path: 'welcome',
    component: WelcomeComponent,
    data: { title: 'Welcome' },
  },
  {
    path: 'faqs',
    component: FaqsComponent,
    data: { title: 'FAQs' },
  },
  {
    path: 'profile',
    component: ProfileComponent,
    data: { title: 'Profile' },
  },

  {
    path: 'contact-us',
    component: ContactUsComponent,
    data: { title: 'Contact Us' },
  },
  {
    path: 'about-us',
    component: AboutUsComponent,
    data: { title: 'About Us' },
  },
  {
    path: 'our-team',
    component: TeamComponent,
    data: { title: 'Our Team' },
  },
  {
    path: 'timeline',
    component: TimelineComponent,
    data: { title: 'Timeline' },
  },
  {
    path: 'pricing',
    component: PricingComponent,
    data: { title: 'Pricing' },
  },
  {
    path: 'error-404-alt',
    component: Error404AltComponent,
    data: { title: '404' },
  },
]
