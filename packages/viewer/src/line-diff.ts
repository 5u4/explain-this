export type DiffRow =
  | { readonly kind: "context"; readonly before: number; readonly after: number }
  | { readonly kind: "removed"; readonly before: number }
  | { readonly kind: "added"; readonly after: number };

export type DiffPiece =
  | { readonly kind: "shown"; readonly rows: ReadonlyArray<DiffRow> }
  | { readonly kind: "folded"; readonly rows: ReadonlyArray<DiffRow> };

export const lineDiff = (
  before: ReadonlyArray<string>,
  after: ReadonlyArray<string>,
): ReadonlyArray<DiffRow> => {
  const n = before.length;
  const m = after.length;
  const offset = n + m + 1;
  const stepsDown = (reach: Int32Array, k: number, d: number): boolean =>
    k === -d || (k !== d && (reach[offset + k - 1] ?? 0) < (reach[offset + k + 1] ?? 0));
  const reach = new Int32Array(2 * offset + 1);
  const trace: Array<Int32Array> = [];
  search: for (let d = 0; d <= n + m; d++) {
    trace.push(reach.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = stepsDown(reach, k, d)
        ? (reach[offset + k + 1] ?? 0)
        : (reach[offset + k - 1] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && before[x] === after[y]) {
        x++;
        y++;
      }
      reach[offset + k] = x;
      if (x >= n && y >= m) break search;
    }
  }
  const reversed: Array<DiffRow> = [];
  let x = n;
  let y = m;
  trace.reverse().forEach((previous, index) => {
    const d = trace.length - 1 - index;
    const k = x - y;
    const previousK = stepsDown(previous, k, d) ? k + 1 : k - 1;
    const previousX = previous[offset + previousK] ?? 0;
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      x--;
      y--;
      reversed.push({ kind: "context", before: x, after: y });
    }
    if (d === 0) return;
    reversed.push(
      x === previousX
        ? { kind: "added", after: previousY }
        : { kind: "removed", before: previousX },
    );
    x = previousX;
    y = previousY;
  });
  return reversed.reverse();
};

const foldOver = 6;
const keep = 3;

export const foldContext = (rows: ReadonlyArray<DiffRow>): ReadonlyArray<DiffPiece> => {
  const pieces: Array<DiffPiece> = [];
  let shown: Array<DiffRow> = [];
  let run: Array<DiffRow> = [];
  const closeRun = () => {
    if (run.length > foldOver) {
      pieces.push(
        { kind: "shown", rows: [...shown, ...run.slice(0, keep)] },
        { kind: "folded", rows: run.slice(keep, -keep) },
      );
      shown = run.slice(-keep);
    } else {
      shown.push(...run);
    }
    run = [];
  };
  for (const row of rows) {
    if (row.kind === "context") {
      run.push(row);
      continue;
    }
    closeRun();
    shown.push(row);
  }
  closeRun();
  if (shown.length > 0) pieces.push({ kind: "shown", rows: shown });
  return pieces;
};
