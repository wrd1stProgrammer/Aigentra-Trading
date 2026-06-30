export type ShellNavigationClick = {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

export function shouldHandleShellNavigationClick(event: ShellNavigationClick) {
  return !event.defaultPrevented
    && event.button === 0
    && !event.metaKey
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey;
}

export function visibleShellPathname(pathname: string, pendingPathname: string | null) {
  return pendingPathname ?? pathname;
}

export function isShellLinkActive(href: string, visiblePathname: string) {
  return href === "/" ? visiblePathname === "/" : visiblePathname.startsWith(href);
}
