/** Logical design surface — same size on every screen / window. */
export const DESIGN_CANVAS_W = 1600
export const DESIGN_CANVAS_H = 1000

export type DesignSize = { w: number; h: number }

export const DESIGN_CANVAS: DesignSize = {
  w: DESIGN_CANVAS_W,
  h: DESIGN_CANVAS_H,
}

/** Map a pointer from CSS box → logical design coordinates. */
export function clientToDesignPos(
  clientX: number,
  clientY: number,
  el: HTMLElement,
): { x: number; y: number; over: boolean } {
  const rect = el.getBoundingClientRect()
  const over =
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  return {
    x: ((clientX - rect.left) / Math.max(rect.width, 1)) * DESIGN_CANVAS_W,
    y: ((clientY - rect.top) / Math.max(rect.height, 1)) * DESIGN_CANVAS_H,
    over,
  }
}

/** Logical design point → CSS pixels relative to the element. */
export function designToCssPos(
  p: { x: number; y: number },
  el: HTMLElement,
): { x: number; y: number } {
  const rect = el.getBoundingClientRect()
  return {
    x: (p.x / DESIGN_CANVAS_W) * rect.width,
    y: (p.y / DESIGN_CANVAS_H) * rect.height,
  }
}

/**
 * Logical design point → CSS pixels relative to a positioned ancestor
 * (accounts for letterboxed canvas offset inside the wrap).
 */
export function designToCssPosInParent(
  p: { x: number; y: number },
  el: HTMLElement,
  parent: HTMLElement,
): { x: number; y: number } {
  const elRect = el.getBoundingClientRect()
  const parentRect = parent.getBoundingClientRect()
  return {
    x:
      (p.x / DESIGN_CANVAS_W) * elRect.width +
      (elRect.left - parentRect.left),
    y:
      (p.y / DESIGN_CANVAS_H) * elRect.height +
      (elRect.top - parentRect.top),
  }
}
