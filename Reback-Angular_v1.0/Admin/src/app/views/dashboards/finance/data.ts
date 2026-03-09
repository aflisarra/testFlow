const avatar1 = 'assets/images/users/avatar-6.jpg'
const avatar2 = 'assets/images/users/avatar-2.jpg'
const avatar3 = 'assets/images/users/avatar-10.jpg'
const avatar4 = 'assets/images/users/avatar-5.jpg'
const avatar5 = 'assets/images/users/avatar-4.jpg'

export type StateType = {
  name: string
  amount: string
  icon: string
  iconColor: string
  percentage: string
  percentageColor: string
}

export type TransactionType = {
  image: string
  name: string
  description: string
  amount: string
  date: string
  time: string
  status: string
}

export const stateData: StateType[] = [
  {
    name: 'Wallet Balance',
    amount: '55.6',
    icon: 'iconamoon:credit-card-duotone',
    iconColor: 'info',
    percentage: '8.72',
    percentageColor: 'success',
  },
  {
    name: 'Total Income',
    amount: '75.09',
    icon: 'iconamoon:store-duotone',
    iconColor: 'primary',
    percentage: '7.36',
    percentageColor: 'success',
  },
  {
    name: 'Total Expenses',
    amount: '62.8',
    icon: 'iconamoon:3d-duotone',
    iconColor: 'success',
    percentage: '5.62',
    percentageColor: 'danger',
  },
  {
    name: 'Investments',
    amount: '6.4',
    icon: 'iconamoon:3d-duotone',
    iconColor: 'warning',
    percentage: '2.53',
    percentageColor: 'success',
  },
]

export const transactionList: TransactionType[] = [
  {
    image: avatar1,
    name: 'Adam M',
    description: 'Licensing Revenue',
    amount: 'USD $750.00',
    date: '20 Apr,24',
    time: '10:31:23 am',
    status: 'Success',
  },
  {
    image: avatar2,
    name: 'Alexa Newsome',
    description: 'Invoice #1001',
    amount: '-AUD $90.99',
    date: '18 Apr,24',
    time: '06:22:09 pm',
    status: 'Cancelled',
  },
  {
    image: avatar3,
    name: 'Shelly Dorey',
    description: 'Custom Software Development',
    amount: 'USD $500.00',
    date: '16 Apr,24',
    time: '05:09:58 pm',
    status: 'Success',
  },
  {
    image: avatar4,
    name: 'Fredrick Arnett',
    description: 'Envato Payout - Collaboration',
    amount: 'USD $1250.95',
    date: '16 Apr,24',
    time: '0:21:25 am',
    status: 'Onhold',
  },
  {
    image: avatar5,
    name: 'Barbara Frink',
    description: 'Personal Payment',
    amount: '-AUD $90.99',
    date: '12 Apr,24',
    time: '06:22:09 pm',
    status: 'Failed',
  },
]
