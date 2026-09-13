import { Action, type ActionReducer, type MetaReducer, createReducer, on } from '@ngrx/store'
import { localStorageSync } from 'ngrx-store-localstorage'
import {
  LAYOUT_COLOR_TYPES,
  MENU_COLOR_TYPES,
  SIDEBAR_SIZE_TYPES,
  TOPBAR_COLOR_TYPES,
} from './layout'
import * as appActions from './layout-action'
import {
  changemenucolor,
  changesidebarsize,
  changetheme,
  changetopbarcolor,
} from './layout-action'

export interface LayoutState {
  LAYOUT_THEME: string
  TOPBAR_COLOR: string
  MENU_COLOR: string
  MENU_SIZE: string
}

// IntialState
export const initialState: LayoutState = {
  LAYOUT_THEME: LAYOUT_COLOR_TYPES.LIGHTMODE,
  TOPBAR_COLOR: TOPBAR_COLOR_TYPES.LIGHT,
  MENU_COLOR: MENU_COLOR_TYPES.LIGHT,
  MENU_SIZE: SIDEBAR_SIZE_TYPES.DEFAULT,
}

// Reducer
export const layoutReducer = createReducer(
  initialState,
  on(changetheme, (state) => ({
    ...state,
    LAYOUT_THEME: 'light',
  })),
  on(changetopbarcolor, (state) => ({
    ...state,
    TOPBAR_COLOR: 'light',
  })),
  on(changemenucolor, (state) => ({
    ...state,
    MENU_COLOR: 'light',
  })),
  on(changesidebarsize, (state, action) => ({
    ...state,
    MENU_SIZE: action.size,
  })),
  on(appActions.resetState, () => initialState)
)

// Configuration for localStorageSync
export const localStorageSyncReducer: MetaReducer = <State, A extends Action = Action>(
  reducer: ActionReducer<State, A>
): ActionReducer<State, A> => {
  return localStorageSync({
    keys: ['layout'],
    rehydrate: true,
  })(reducer) as ActionReducer<State, A>
}

// Selector
export function reducer(state: LayoutState | undefined, action: Action) {
  return layoutReducer(state, action)
}

export const rootReducer = localStorageSyncReducer(layoutReducer)
