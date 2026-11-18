"use strict";

// Creates an animated placeholder skeleton bar element
export function createSkeletonBar({ width = "100%", height = "16px", className = "" } = {}) {
  const bar = document.createElement("div");
  bar.className = `skeleton ${className}`.trim();
  bar.style.width = width;
  bar.style.height = height;
  return bar;
}
