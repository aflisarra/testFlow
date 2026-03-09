import type { MenuItem } from '../common/menu-meta'

export const findAllParent = (menuItems: MenuItem[], menuItem: any): any => {
  let parents = []
  const parent = findMenuItem(menuItems, menuItem['parentKey'])

  if (parent) {
    parents.push(parent['key'])
    if (parent['parentKey'])
      parents = [...parents, ...findAllParent(menuItems, parent)]
  }
  return parents
}

export const findMenuItem = (
  menuItems: MenuItem[],
  menuItemKey: string
): any => {
  if (menuItems && menuItemKey) {
    for (var i = 0; i < menuItems.length; i++) {
      if (menuItems[i].key === menuItemKey) {
        return menuItems[i]
      }
      var found = findMenuItem(menuItems[i].subMenu, menuItemKey)
      if (found) return found
    }
  }
  return null
}

export function addOrSubtractDaysFromDate(days: number): Date {
  const result = new Date()
  result.setDate(result.getDate() + days)
  return result
}
