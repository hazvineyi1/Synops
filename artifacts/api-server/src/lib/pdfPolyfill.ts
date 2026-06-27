// pdf-parse pulls in pdf.js, whose canvas/display module evaluates browser-only
// globals (DOMMatrix, ImageData, Path2D) at import time. In Node those are
// undefined and there's no @napi-rs/canvas to polyfill them, which crashes the
// process on startup. We only use pdf-parse for TEXT extraction (getText), never
// canvas rendering, so harmless stubs are enough to let the module load.
//
// This module must be imported BEFORE anything that pulls in pdf-parse (see
// index.ts), because ES module imports are evaluated in order.
const g = globalThis as any;

if (typeof g.DOMMatrix === "undefined") {
  g.DOMMatrix = class DOMMatrix {
    constructor() {
      /* no-op stub; rendering is unused */
    }
  };
}

if (typeof g.ImageData === "undefined") {
  g.ImageData = class ImageData {
    constructor() {
      /* no-op stub */
    }
  };
}

if (typeof g.Path2D === "undefined") {
  g.Path2D = class Path2D {
    constructor() {
      /* no-op stub */
    }
  };
}

export {};
