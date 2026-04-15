type StateType = {
  icon: string
  name: string
  amount: string
  iconColor: string
}

type CountryType = {
  icon: string
  name: string
  progressValue: number
  progressAmount: number
  progressType: string
}

type BrowserType = {
  name: string
  percentage: number
  amount: number
}

export const stateData: StateType[] = [
  {
    icon: 'iconamoon:eye-duotone',
    name: 'Page View',
    amount: '13,647',
    iconColor: 'primary',
  },
  {
    icon: 'iconamoon:link-external-duotone',
    name: 'Clicks',
    amount: '9,526',
    iconColor: 'success',
  },
  {
    icon: 'iconamoon:trend-up-bold',
    name: 'Conversions',
    amount: '65.2%',
    iconColor: 'danger',
  },
  {
    icon: 'iconamoon:profile-circle-duotone',
    name: 'New Users',
    amount: '9.5k',
    iconColor: 'warning',
  },
]

export const countryList: CountryType[] = [
  {
    icon: 'circle-flags:us',
    name: 'United States',
    progressValue: 82.5,
    progressAmount: 659,
    progressType: 'secondary',
  },
  {
    icon: 'circle-flags:ru',
    name: 'Russia',
    progressValue: 70.5,
    progressAmount: 485,
    progressType: 'info',
  },
  {
    icon: 'circle-flags:cn',
    name: 'China',
    progressValue: 65.8,
    progressAmount: 355,
    progressType: 'warning',
  },
  {
    icon: 'circle-flags:ca',
    name: 'Canada',
    progressValue: 55.8,
    progressAmount: 204,
    progressType: 'success',
  },
  {
    icon: 'circle-flags:br',
    name: 'Brazil',
    progressValue: 35.9,
    progressAmount: 109,
    progressType: 'primary',
  },
]

export const browserList: BrowserType[] = [
  {
    name: 'Chrome',
    percentage: 62.5,
    amount: 5.06,
  },
  {
    name: 'Firefox',
    percentage: 12.3,
    amount: 1.5,
  },
  {
    name: 'Safari',
    percentage: 9.86,
    amount: 1.03,
  },
  {
    name: 'Brave',
    percentage: 3.15,
    amount: 0.3,
  },
  {
    name: 'Opera',
    percentage: 3.01,
    amount: 1.58,
  },
  {
    name: 'Falkon',
    percentage: 2.8,
    amount: 0.01,
  },
  {
    name: 'Other',
    percentage: 6.38,
    amount: 3.6,
  },
]

export const pageList = [
  {
    path: 'reback/dashboard.html',
    views: 4265,
    time: '09m:45s',
    rate: '20.4',
    rateColor: 'danger',
  },
  {
    path: 'reback/chat.html',
    views: 2584,
    time: '05m:02s',
    rate: '12.25',
    rateColor: 'warning',
  },
  {
    path: 'reback/auth-login.html',
    views: 3369,
    time: '04m:25s',
    rate: '5.2',
    rateColor: 'success',
  },
  {
    path: 'reback/email.html',
    views: 985,
    time: '02m:03s',
    rate: '64.2',
    rateColor: 'danger',
  },
  {
    path: 'reback/social.html',
    views: 653,
    time: '15m:56s',
    rate: '2.4',
    rateColor: 'success',
  },
]
