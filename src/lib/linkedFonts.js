// Fonts the library points to without keeping a copy: the artist's page, not our files. Loads under plain Node.

export const LINKED_FONTS = Object.freeze([
  Object.freeze({
    id: 'linked/frogblock',
    fontId: 'TBD', // the library script fills in the real id from the upstream file
    name: 'FROGBLOCK',
    height: 8,
    upstream: 'moebius/custom/FROGBLOCK.F08',
    machine: 'Custom',
    chars: 'cp437',
    credit: 'FROGBLOCK font by Polyducks',
    url: 'https://polyducks.itch.io/frogblock',
    license: 'https://github.com/hlotvonen/moebiusXBIN/blob/master/FROGBLOCK_license.txt',
  }),
]);

export const linkedFontOf = (fontId) => LINKED_FONTS.find((f) => f.fontId === fontId) ?? null;
