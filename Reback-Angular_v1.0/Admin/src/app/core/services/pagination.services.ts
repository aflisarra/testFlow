import { Injectable } from '@angular/core'

@Injectable({
  providedIn: 'root',
})
export class PaginationService {
  page = 1
  startIndex: number = 0
  endIndex: number = 0

  constructor() {}

  refreshData(displayList: any[], data: any[], pageSize: number) {
    this.startIndex = (this.page - 1) * pageSize + 1
    this.endIndex = (this.page - 1) * pageSize + pageSize

    displayList = data
      .map((item: any, i: number) => ({ id: i + 1, ...item }))
      .slice(this.startIndex - 1, this.endIndex)
    return displayList
  }

  searchTerm(displayList: any[], data: any[], searchQuery: string) {
    if (searchQuery) {
      displayList = data.filter((item) =>
        Object.values(item).some((value: any) =>
          value.toString().toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    } else {
      displayList = data
    }
    return displayList
  }
}
