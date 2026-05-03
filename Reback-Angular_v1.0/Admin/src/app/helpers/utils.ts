import type { MenuItem } from '../common/menu-meta'

export const findAllParent = (
  menuItems: MenuItem[],
  menuItem: MenuItem
): string[] => {
  const parents: string[] = []
  const visitedKeys = new Set<string>()

  let current: MenuItem | null = menuItem
  while (current?.parentKey) {
    const parentKey = String(current.parentKey).trim()
    if (!parentKey) break

    // Prevent infinite loops if the menu config has a cycle.
    if (visitedKeys.has(parentKey)) break
    visitedKeys.add(parentKey)

    const parent = findMenuItem(menuItems, parentKey)
    if (!parent?.key) break

    parents.push(parent.key)
    current = parent
  }

  return parents
}

export const findMenuItem = (
  menuItems: MenuItem[],
  menuItemKey: string,
  visited: Set<MenuItem> = new Set()
): MenuItem | null => {
  if (menuItemKey) {
    for (const item of menuItems) {
      // Prevent infinite recursion if the menu config has object-reference cycles.
      if (visited.has(item)) continue
      visited.add(item)

      if (item.key === menuItemKey) {
        return item
      }

      const found = findMenuItem(item.subMenu ?? [], menuItemKey, visited)

      if (found) {
        return found
      }
    }
  }

  return null
}

export function addOrSubtractDaysFromDate(days: number): Date {
  const result = new Date()
  result.setDate(result.getDate() + days)
  return result
}
