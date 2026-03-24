import { currentYear } from '@/app/common/constants'

export type ClientType = {
  name: string
  avatar: string
}

export type InvoiceType = {
  invoice_number: string
  client: ClientType
  issue_date: string
  due_date: string
  amount: number
  status: string
  payment_method: string
}

export type ProductType = {
  name: string
  qty: number
  price: number
}

export const InvoicesData: InvoiceType[] = [
  {
    invoice_number: 'RB6985',
    client: {
      name: 'Sean Kemper',
      avatar: 'assets/images/users/avatar-2.jpg',
    },
    issue_date: currentYear + '-04-23T17:09:00',
    due_date: currentYear + '-04-30',
    amount: 852.25,
    status: 'Unpaid',
    payment_method: 'PayPal',
  },
  {
    invoice_number: 'RB1002',
    client: {
      name: 'Victoria Sullivan',
      avatar: 'assets/images/users/avatar-3.jpg',
    },
    issue_date: currentYear + '-05-14T10:51:00',
    due_date: currentYear + '-08-25',
    amount: 953.0,
    status: 'Send',
    payment_method: 'PayPal',
  },
  {
    invoice_number: 'RB3652',
    client: {
      name: 'Liam Martinez',
      avatar: 'assets/images/users/avatar-4.jpg',
    },
    issue_date: currentYear + '-04-12T12:09:00',
    due_date: currentYear + '-04-28',
    amount: 99.0,
    status: 'Unpaid',
    payment_method: 'Swift Transfer',
  },
  {
    invoice_number: 'RB7854',
    client: {
      name: 'Emma Johnson',
      avatar: 'assets/images/users/avatar-5.jpg',
    },
    issue_date: currentYear + '-04-10T22:09:00',
    due_date: currentYear + '-04-15',
    amount: 1250.0,
    status: 'Paid',
    payment_method: 'PayPal',
  },
  {
    invoice_number: 'RB9521',
    client: {
      name: 'Olivia Thompson',
      avatar: 'assets/images/users/avatar-1.jpg',
    },
    issue_date: currentYear + '-05-22T15:41:00',
    due_date: currentYear + '-07-05',
    amount: 500.0,
    status: 'Send',
    payment_method: 'Payoneer',
  },
  {
    invoice_number: 'RB9634',
    client: {
      name: 'Noah Garcia',
      avatar: 'assets/images/users/avatar-6.jpg',
    },
    issue_date: currentYear + '-05-18T09:09:00',
    due_date: currentYear + '-05-30',
    amount: 250.0,
    status: 'Paid',
    payment_method: 'Bank',
  },
  {
    invoice_number: 'RB8520',
    client: {
      name: 'Sophia Davis',
      avatar: 'assets/images/users/avatar-7.jpg',
    },
    issue_date: currentYear + '-04-05T08:50:00',
    due_date: currentYear + '-04-22',
    amount: 29.0,
    status: 'Paid',
    payment_method: 'PayPal',
  },
  {
    invoice_number: 'RB3590',
    client: {
      name: 'Isabella Lopez',
      avatar: 'assets/images/users/avatar-8.jpg',
    },
    issue_date: currentYear + '-06-15T23:09:00',
    due_date: currentYear + '-08-01',
    amount: 24.99,
    status: 'Send',
    payment_method: 'Swift',
  },
  {
    invoice_number: 'RB5872',
    client: {
      name: 'Ava Wilson',
      avatar: 'assets/images/users/avatar-9.jpg',
    },
    issue_date: currentYear + '-04-22T17:09:00',
    due_date: currentYear + '-04-30',
    amount: 1000.0,
    status: 'Unpaid',
    payment_method: 'Payoneer',
  },
  {
    invoice_number: 'RB1158',
    client: {
      name: 'Oliver Lee',
      avatar: 'assets/images/users/avatar-10.jpg',
    },
    issue_date: currentYear + '-04-23T12:09:00',
    due_date: currentYear + '-04-30',
    amount: 1999.0,
    status: 'Unpaid',
    payment_method: 'Wise',
  },
]

export const InvoiceDetailsProduct: ProductType[] = [
  {
    name: 'G15 Gaming Laptop',
    qty: 3,
    price: 240.59,
  },
  {
    name: 'Sony Alpha ILCE 6000Y 24.3 MP Mirrorless Digital SLR Camera',
    qty: 5,
    price: 135.99,
  },
  {
    name: 'Sony Over-Ear Wireless Headphone with Mic',
    qty: 1,
    price: 99.49,
  },
  {
    name: 'Adam ROMA USB-C / USB-A 3.1 (2-in-1 Flash Drive) – 128GB',
    qty: 2,
    price: 350.19,
  },
]
