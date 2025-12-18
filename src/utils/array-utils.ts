export const areStringArraysEqual = (
  a: readonly string[],
  b: readonly string[]
) => a.length === b.length && a.every((value, index) => value === b[index])
