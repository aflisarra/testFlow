import { currentYear } from '@/app/common/constants'

type UserType = {
  avatar: string
  name: string
}

type AccountType = {
  id: string
  date: string
  user: UserType
  status: string
  username: string
}

export type TransactionType = {
  id: string
  date: string
  amount: string
  status: string
  description: string
}

export type OrderType = {
  orderId: string
  date: string
  productImage: string
  name: string
  email: string
  phone: string
  address: string
  paymentType: string
  status: string
}

export const accountData: AccountType[] = [
  {
    id: '#US523',
    date: '24 April, ' + currentYear,
    user: {
      avatar: 'assets/images/users/avatar-2.jpg',
      name: 'Dan Adrick',
    },
    status: 'Verified',
    username: '@omions',
  },
  {
    id: '#US652',
    date: '24 April, ' + currentYear,
    user: {
      avatar: 'assets/images/users/avatar-3.jpg',
      name: 'Daniel Olsen',
    },
    status: 'Verified',
    username: '@alliates',
  },
  {
    id: '#US862',
    date: '20 April, ' + currentYear,
    user: {
      avatar: 'assets/images/users/avatar-4.jpg',
      name: 'Jack Roldan',
    },
    status: 'Pending',
    username: '@griys',
  },
  {
    id: '#US756',
    date: '18 April, ' + currentYear,
    user: {
      avatar: 'assets/images/users/avatar-5.jpg',
      name: 'Betty Cox',
    },
    status: 'Verified',
    username: '@reffon',
  },
  {
    id: '#US420',
    date: '18 April, ' + currentYear,
    user: {
      avatar: 'assets/images/users/avatar-6.jpg',
      name: 'Carlos Johnson',
    },
    status: 'Blocked',
    username: '@bebo',
  },
]

export const TransactionsList: TransactionType[] = [
  {
    id: '#98521',
    date: '24 April, ' + currentYear,
    amount: '120.55',
    status: 'Cr',
    description: 'Commisions',
  },
  {
    id: '#20158',
    date: '24 April, ' + currentYear,
    amount: '9.68',
    status: 'Cr',
    description: 'Affiliates',
  },
  {
    id: '#36589',
    date: '20 April, ' + currentYear,
    amount: '105.22',
    status: 'Dr',
    description: 'Grocery',
  },
  {
    id: '#95362',
    date: '18 April, ' + currentYear,
    amount: '80.59',
    status: 'Cr',
    description: 'Refunds',
  },
  {
    id: '#75214',
    date: '18 April, ' + currentYear,
    amount: '750.95',
    status: 'Dr',
    description: 'Bill Payments',
  },

  {
    id: '#75215',
    date: '17 April, ' + currentYear,
    amount: '455.62',
    status: 'Dr',
    description: 'Electricity',
  },
  {
    id: '#75216',
    date: '17 April, ' + currentYear,
    amount: '102.77',
    status: 'Cr',
    description: 'Interest',
  },
  {
    id: '#75217',
    date: '16 April, ' + currentYear,
    amount: '79.49',
    status: 'Cr',
    description: 'Refunds',
  },
  {
    id: '#75218',
    date: '05 April, ' + currentYear,
    amount: '980.00',
    status: 'Dr',
    description: 'Shopping',
  },
]

export const ordersList: OrderType[] = [
  {
    orderId: '#RB5625',
    date: '29 April ' + currentYear,
    productImage: 'assets/images/products/product-1(1).png',
    name: 'Anna M. Hines',
    email: 'anna.hines@mail.com',
    phone: '(+1)-555-1564-261',
    address: 'Burr Ridge/Illinois',
    paymentType: 'Credit Card',
    status: 'Completed',
  },
  {
    orderId: '#RB9652',
    date: '25 April ' + currentYear,
    productImage: 'assets/images/products/product-4.png',
    name: 'Judith H. Fritsche',
    email: 'judith.fritsche.com',
    phone: '(+57)-305-5579-759',
    address: 'SULLIVAN/Kentucky',
    paymentType: 'Credit Card',
    status: 'Completed',
  },
  {
    orderId: '#RB5984',
    date: '25 April ' + currentYear,
    productImage: 'assets/images/products/product-5.png',
    name: 'Peter T. Smith',
    email: 'peter.smith@mail.com',
    phone: '(+33)-655-5187-93',
    address: 'Yreka/California',
    paymentType: 'Pay Pal',
    status: 'Completed',
  },
  {
    orderId: '#RB3625',
    date: '21 April ' + currentYear,
    productImage: 'assets/images/products/product-6.png',
    name: 'Emmanuel J. Delcid',
    email: 'emmanuel.delicid@mail.com',
    phone: '(+30)-693-5553-637',
    address: 'Atlanta/Georgia',
    paymentType: 'Pay Pal',
    status: 'Processing',
  },
  {
    orderId: '#RB8652',
    date: '18 April ' + currentYear,
    productImage: 'assets/images/products/product-1(2).png',
    name: 'William J. Cook',
    email: 'william.cook@mail.com',
    phone: '(+91)-855-5446-150',
    address: 'Rosenberg/Texas',
    paymentType: 'Credit Card',
    status: 'Processing',
  },
]
