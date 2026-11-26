// Where each setup item goes on the 120 x 50 grid, in cells: [col, row, cols wide, rows tall]. Layer 1's items and the
// vector layer's are kept apart (the vector layer has the right-hand column, cols 96-119), except OVERLAP, the one place
// they meet on purpose. The numbers are the setup's items in the review doc.
export const GRID = { cols: 120, rows: 50 };

export const LAYER1 = {
  poem: [2, 1, 34, 3], //                    1 (and 25, the swapped cells, on its first line)
  pencilCurve: [2, 5, 34, 6], //             2
  typedBlocks: [2, 11, 14, 2], //            30, block characters typed by hand: someone's own, kept through Blend
  pencilSingle: [38, 1, 18, 10], //          3, a figure eight of single lines
  pencilDouble: [46, 4, 18, 10], //          4, overlapping 3; 10 and 11 fill inside them
  brushColorsOnly: [66, 1, 28, 3], //        5
  brushHalfBlock: [66, 5, 28, 3], //         6
  brushHalfOpacity: [66, 9, 28, 3], //       7; 8 (Eraser), 12 (Blur) and 13 (Dodge, Burn) cross 5-7 top to bottom
  halfBlockShape: [2, 13, 12, 7], //         9
  squares: [16, 13, 46, 7], //               14: Single, Double, Half-block, Half-block a half cell lower
  circlesHalf: [2, 21, 92, 9], //            15-18 in Half-block
  circlesFull: [2, 31, 92, 9], //            15-18 in Full-block
  crossingLines: [64, 13, 9, 7], //          19
  pen: [74, 13, 10, 7], //                   26, a vector shape merged down
  penOwnChars: [84, 13, 10, 7], //           26b, a polygon merged down from a layer with its own characters
  linesHalf: [2, 41, 46, 8], //              20-24 in Half-block
  linesFull: [50, 41, 44, 8], //             20-24 in Full-block
};

export const VECTOR = {
  free: [96, 1, 23, 14], //                  27: snap None
  cells: [96, 17, 23, 14], //                28: snap Cells
  halfCells: [96, 33, 23, 14], //            29: snap Half cells
};

// The one deliberate overlap: a vector circle over the end of the half-opacity stroke.
export const OVERLAP = [90, 8, 8, 5];
