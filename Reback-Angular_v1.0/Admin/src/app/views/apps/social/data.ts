import { currentYear } from '@/app/common/constants'

export type ProfileType = {
  image: string
  name: string
  location: string
  about: string
  post: number
  followers: string
  following: number
}

export type EventType = {
  icon?: string
  image?: string
  title: string
  date?: string
  location?: string
}

export type FriendRequestType = {
  profile: string
  name: string
  mutual: number
}

export type CommentType = {
  author: string
  avatar: string
  timestamp: string
  comment: string
  like?: number
  children?: CommentType[]
}

export type FeedType = {
  author: string
  avatar: string
  timestamp: string
  content: string
  likes?: string
  comments?: number
  images?: string[]
  commentList?: CommentType[]
  views?: string
  video?: string
  isReply?: boolean
}

export type GroupType = {
  image: string
  title: string
  caption?: string
  member?: string
}

export const ProfileDetail: ProfileType = {
  image: 'assets/images/users/avatar-1.jpg',
  name: 'Gatson Keller',
  location: 'California, USA',
  about:
    "Hi I'm Cynthia Price,has been the industry's standard dummy text To an English person.",
  post: 389,
  followers: '5K',
  following: 210,
}

export const EventData: EventType[] = [
  {
    icon: 'bx-cake',
    title: "Aarya's birthday today",
  },
  {
    icon: 'bx-heart',
    title: "Penda's wedding tomorrow",
  },
  {
    icon: 'bx-bookmark',
    title: 'Meeting with Big B',
  },
]

export const FeedData: FeedType[] = [
  {
    author: 'Jeremy Tomlinson',
    avatar: 'assets/images/users/avatar-3.jpg',
    timestamp: 'about 2 minutes ago',
    content:
      'Story based around the idea of time lapse, animation to post soon!',
    images: [
      'assets/images/app-social/post-1.jpg',
      'assets/images/app-social/post-2.jpg',
      'assets/images/app-social/post-4.jpg',
      'assets/images/app-social/post-3.jpg',
    ],
    likes: '1.5k',
    comments: 521,
    isReply: true,
  },
  {
    author: 'Thelma Fridley',
    avatar: 'assets/images/users/avatar-4.jpg',
    timestamp: 'about 1 hour ago',
    content:
      '🌟✨ Just spent the most amazing weekend camping in the wilderness! 🏕️🌲 Nothing beats disconnecting from the hustle and bustle of city life and reconnecting with nature.',
    likes: '1.5k',
    comments: 521,
    commentList: [
      {
        author: 'Jeremy Tomlinson',
        avatar: 'assets/images/users/avatar-3.jpg',
        timestamp: '3 hours ago',
        comment: 'Nice work, makes me think of The Money Pit.',
        like: 2,
        children: [
          {
            author: 'Kathleen Thomas',
            avatar: 'assets/images/users/avatar-4.jpg',
            timestamp: '5 hours ago',
            comment:
              "i'm in the middle of a timelapse animation myself! (Very different though.) Awesome stuff.",
          },
        ],
      },
    ],
  },
  {
    author: 'Jonathan Tiner',
    avatar: 'assets/images/users/avatar-6.jpg',
    timestamp: 'about 11 hour ago',
    content:
      'The parallax is a little odd but O.o that house build is awesome!!',
    video: 'https://player.vimeo.com/video/87993762',
    views: '3.5k',
    comments: 521,
  },
]

export const PendingRequest: FriendRequestType[] = [
  {
    profile: 'assets/images/users/avatar-2.jpg',
    name: 'Daniel J. Olsen',
    mutual: 46,
  },
  {
    profile: 'assets/images/users/avatar-3.jpg',
    name: 'Jack P. Roldan',
    mutual: 23,
  },
]

export const FriendRequest: FriendRequestType[] = [
  {
    profile: 'assets/images/users/avatar-5.jpg',
    name: 'Victoria P. Miller',
    mutual: 0,
  },
  {
    profile: 'assets/images/users/avatar-6.jpg',
    name: 'Dallas C. Payne',
    mutual: 856,
  },
  {
    profile: 'assets/images/users/avatar-7.jpg',
    name: 'Florence A. Lopez',
    mutual: 52,
  },
  {
    profile: 'assets/images/users/avatar-8.jpg',
    name: 'Gail A. Nix',
    mutual: 12,
  },
  {
    profile: 'assets/images/users/avatar-9.jpg',
    name: 'Lynne J. Petty',
    mutual: 0,
  },
  {
    profile: 'assets/images/users/avatar-5.jpg',
    name: 'Victoria P. Miller',
    mutual: 0,
  },
  {
    profile: 'assets/images/users/avatar-6.jpg',
    name: 'Dallas C. Payne',
    mutual: 856,
  },
  {
    profile: 'assets/images/users/avatar-7.jpg',
    name: 'Florence A. Lopez',
    mutual: 52,
  },
  {
    profile: 'assets/images/users/avatar-8.jpg',
    name: 'Gail A. Nix',
    mutual: 12,
  },
  {
    profile: 'assets/images/users/avatar-9.jpg',
    name: 'Lynne J. Petty',
    mutual: 0,
  },
]

export const EventList: EventType[] = [
  {
    image: 'assets/images/app-social/group-2.jpg',
    date: 'Fri 22 - 26 oct, ' + currentYear,
    title: 'Musical Event : Des Moines',
    location: '4436 Southern Avenue, Iowa-50309',
  },
  {
    image: 'assets/images/app-social/group-5.jpg',
    date: 'Fri 22 - 26 oct, ' + currentYear,
    title: 'Antisocial Darwinism : Evansville',
    location: '1265 Lucy Lane, Indiana-47710',
  },
  {
    image: 'assets/images/app-social/group-6.jpg',
    date: 'Fri 22 - 26 oct, ' + currentYear,
    title: 'Balls of the Bull Festival : Dallas',
    location: '1422 Liberty Street, Texas-75204',
  },
  {
    image: 'assets/images/app-social/group-7.jpg',
    date: 'Fri 22 - 26 oct, ' + currentYear,
    title: 'Belch Blanket Babylon : LA Follette',
    location: '2542 Cedar Street, Tennessee-37766',
  },
]

export const groupList: GroupType[] = [
  {
    image: 'assets/images/app-social/group-7.jpg',
    title: 'UI / UX Design',
    caption:
      "Some quick example text to build on the card title and make up the bulk of the card's content.",
  },
  {
    image: 'assets/images/app-social/group-8.jpg',
    title: 'Travelling The World',
    caption:
      "Some quick example text to build on the card title and make up the bulk of the card's content.",
  },
  {
    image: 'assets/images/app-social/group-9.jpg',
    title: 'Music Circle',
    caption:
      "Some quick example text to build on the card title and make up the bulk of the card's content.",
  },
]

export const friendsGroup: GroupType[] = [
  {
    image: 'assets/images/app-social/group-1.jpg',
    title: 'Interior Design & Architech',
    caption:
      "Some quick example text to build on the card title and make up the bulk of the card's content.",
  },
  {
    image: 'assets/images/app-social/group-2.jpg',
    title: 'Event Management',
    caption:
      "Some quick example text to build on the card title and make up the bulk of the card's content.",
  },
  {
    image: 'assets/images/app-social/group-5.jpg',
    title: 'Commercial University, Daryaganj, Delhi.',
    caption:
      "Some quick example text to build on the card title and make up the bulk of the card's content.",
  },
  {
    image: 'assets/images/app-social/group-6.jpg',
    title: 'Tourist Place of Potland',
    caption:
      "Some quick example text to build on the card title and make up the bulk of the card's content.",
  },
]

export const suggestedGroup: GroupType[] = [
  {
    image: 'assets/images/app-social/group-3.jpg',
    title: 'Promote Your Business',
    caption:
      "Some quick example text to build on the card title and make up the bulk of the card's content.",
  },
  {
    image: 'assets/images/app-social/group-4.jpg',
    title: 'The Greasy Mullets',
    caption:
      "Some quick example text to build on the card title and make up the bulk of the card's content.",
  },
]

export const joinedGroup: GroupType[] = [
  {
    image: 'assets/images/app-social/group-6.jpg',
    title: 'Tourist Place of Portland',
    member: '2K+ members',
  },
  {
    image: 'assets/images/app-social/group-7.jpg',
    title: 'UI / UX Design',
    member: '1.4K members',
  },
  {
    image: 'assets/images/app-social/group-8.jpg',
    title: 'Travelling The World',
    member: '23M members',
  },
  {
    image: 'assets/images/app-social/group-9.jpg',
    title: 'Music Circle',
    member: '26K members',
  },
]
