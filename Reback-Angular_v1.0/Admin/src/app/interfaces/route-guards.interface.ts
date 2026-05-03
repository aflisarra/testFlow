export interface CanDeactivateComponent {
  canDeactivate: () => boolean | Promise<boolean>
}

