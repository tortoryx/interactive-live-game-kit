const WORLD_WIDTH = 20480;
const WORLD_HEIGHT = 2304;
const ORIGIN_X = WORLD_WIDTH / 2;
const ORIGIN_Y = WORLD_HEIGHT / 2;

const DEFAULT_CELL_SIZE = 24;
const DEFAULT_INFLUENCE = 150;
const MAX_CELLS = 24000;

const HUMAN = 1;
const DEMON = 2;

function emptyGrid(cellSize) {
  return {
    firstCol: 0,
    firstRow: 0,
    field: {
      x: ORIGIN_X,
      y: ORIGIN_Y,
      cellSize,
      cols: 0,
      rows: 0,
      cells: new Uint8Array(0),
    },
  };
}

/*
 * Round outward on a fixed, world-centered lattice. Increasing cell size
 * by powers of two preserves nested grid alignment.
 *
 * Allocation happens only after the cell-count bound has been checked.
 */
function makeGrid(view, requestedCellSize) {
  if (
    view === null ||
    typeof view !== "object" ||
    !Number.isFinite(view.x) ||
    !Number.isFinite(view.y) ||
    !Number.isFinite(view.w) ||
    !Number.isFinite(view.h) ||
    view.w <= 0 ||
    view.h <= 0
  ) {
    return emptyGrid(requestedCellSize);
  }

  const left = Math.max(0, view.x - view.w / 2);
  const right = Math.min(WORLD_WIDTH, view.x + view.w / 2);
  const top = Math.max(0, view.y - view.h / 2);
  const bottom = Math.min(WORLD_HEIGHT, view.y + view.h / 2);

  if (!(left < right && top < bottom)) {
    return emptyGrid(requestedCellSize);
  }

  let cellSize = requestedCellSize;
  let firstCol;
  let firstRow;
  let endCol;
  let endRow;
  let cols;
  let rows;

  for (;;) {
    firstCol = Math.floor((left - ORIGIN_X) / cellSize);
    endCol = Math.ceil((right - ORIGIN_X) / cellSize);
    firstRow = Math.floor((top - ORIGIN_Y) / cellSize);
    endRow = Math.ceil((bottom - ORIGIN_Y) / cellSize);

    cols = endCol - firstCol;
    rows = endRow - firstRow;

    if (
      Number.isSafeInteger(firstCol) &&
      Number.isSafeInteger(endCol) &&
      Number.isSafeInteger(firstRow) &&
      Number.isSafeInteger(endRow) &&
      cols > 0 &&
      rows > 0 &&
      cols <= MAX_CELLS / rows
    ) {
      break;
    }

    // Even an extremely small positive input eventually reaches a safe
    // resolution. Because the view is world-clipped, this loop terminates
    // before cellSize can overflow.
    cellSize *= 2;
  }

  return {
    firstCol,
    firstRow,
    field: {
      x: ORIGIN_X + firstCol * cellSize,
      y: ORIGIN_Y + firstRow * cellSize,
      cellSize,
      cols,
      rows,
      cells: new Uint8Array(cols * rows),
    },
  };
}

function makeRow() {
  return {
    left: Infinity,
    right: -Infinity,
    front: Infinity,
    xs: [],
    weights: [],
    starts: [],
    cursor: 0,
    spans: [],
    spanCursor: 0,
  };
}

function resetRow(row, front) {
  row.left = Infinity;
  row.right = -Infinity;
  row.front = front;
  row.xs.length = 0;
  row.weights.length = 0;
  row.starts.length = 0;
  row.cursor = 0;
  row.spans.length = 0;
  row.spanCursor = 0;
}

/*
 * Maintain the lower envelope of parabolas:
 *
 *     cost(t) = (t - x)^2 + weight
 *
 * Sites must arrive in nondecreasing x order. "starts[i]" is the
 * coordinate at which site i becomes the nearest site on this row.
 * Each site is pushed and popped at most once.
 */
function appendSite(row, x, weight) {
  const { xs, weights, starts } = row;

  let last = xs.length - 1;

  // Equal-x sites differ only in their vertical-distance weight.
  if (last >= 0 && xs[last] === x) {
    if (weight >= weights[last]) {
      return;
    }

    xs.pop();
    weights.pop();
    starts.pop();
  }

  let start = -Infinity;

  while (xs.length > 0) {
    last = xs.length - 1;

    const previousX = xs[last];

    // Factoring the difference of squares avoids squaring coordinates
    // when computing the intersection of two parabolas.
    start =
      (previousX + x) / 2 +
      (weight - weights[last]) / (2 * (x - previousX));

    if (start > starts[last]) {
      break;
    }

    xs.pop();
    weights.pop();
    starts.pop();
  }

  if (xs.length === 0) {
    start = -Infinity;
  }

  xs.push(x);
  weights.push(weight);
  starts.push(start);
}

/*
 * Queries arrive left to right. Across a whole raster row, advancing
 * this cursor costs at most the number of sites in the envelope.
 */
function connectNearbySpans(row, maxGap) {
  row.spans.sort((a,b)=>a[0]-b[0]);
  const joined=[];
  for(const span of row.spans){const last=joined.at(-1);if(last&&span[0]-last[1]<=maxGap)last[1]=Math.max(last[1],span[1]);else joined.push(span);}
  row.spans=joined;
}
function supported(row,x){
  while(row.spanCursor<row.spans.length&&row.spans[row.spanCursor][1]<x)row.spanCursor++;
  const span=row.spans[row.spanCursor];return !!span&&span[0]<=x&&x<=span[1];
}

function nearestCost(row, x) {
  while (
    row.cursor + 1 < row.xs.length &&
    row.starts[row.cursor + 1] <= x
  ) {
    row.cursor += 1;
  }

  const dx = x - row.xs[row.cursor];
  return dx * dx + row.weights[row.cursor];
}

/**
 * Build a fresh, troop-influence field without modifying the input.
 *
 * A troop contributes only to rows within its lateral influence radius.
 * For each side and row, rounded troop footprints are joined from the
 * rear to front only across nearby footprints (at most 0.8 radius gap).
 * Distant isolated scouts cannot paint an empty kilometre-wide lane.
 * This connects supported marching columns without constructing a convex
 * hull across unsupported lateral gaps.
 *
 * Where both sides support a cell, the nearest actual row-supporting
 * troop wins. Exact distance ties use a side-symmetric frontline split,
 * rather than leaving a wide neutral area.
 *
 * Invalid views return an empty field. Invalid cellSize values fall back
 * to 24; invalid or negative influence values fall back to 150.
 *
 * Work: O(U log U + rows * U + cells).
 * Working memory: O(U + cells), with cells.length <= 24000.
 *
 * @param {{
 *   units: Array<{
 *     id: string,
 *     side: 'human'|'demon'|'neutral',
 *     kind: string,
 *     x: number,
 *     y: number,
 *     hp: number
 *   }>,
 *   view: {x: number, y: number, w: number, h: number},
 *   cellSize?: number,
 *   influence?: number
 * }} options
 * @returns {{
 *   x: number,
 *   y: number,
 *   cellSize: number,
 *   cols: number,
 *   rows: number,
 *   cells: Uint8Array
 * }}
 */
export function buildFrontlineField({
  units = [],
  view,
  cellSize = DEFAULT_CELL_SIZE,
  influence = DEFAULT_INFLUENCE,
} = {}) {
  const requestedCellSize =
    Number.isFinite(cellSize) && cellSize > 0
      ? cellSize
      : DEFAULT_CELL_SIZE;

  const requestedInfluence =
    Number.isFinite(influence) && influence >= 0
      ? influence
      : DEFAULT_INFLUENCE;

  const { field, firstCol, firstRow } = makeGrid(
    view,
    requestedCellSize,
  );

  if (
    field.cells.length === 0 ||
    !Array.isArray(units) ||
    units.length === 0
  ) {
    return field;
  }

  if(units.some(u=>u?.faction&&u.hp>0))return multiFactionField(field,units,requestedInfluence);
  const sites = [];

  // A power-of-two baseline preserves ordinary integer-world distance
  // comparisons exactly while also keeping squared values small.
  let metricScale = Math.max(32768, field.cellSize);
  let minimumY = Infinity;
  let maximumY = -Infinity;

  for (const unit of units) {
    if (
      unit === null ||
      typeof unit !== "object" ||
      (unit.side !== "human" && unit.side !== "demon") ||
      !Number.isFinite(unit.x) ||
      !Number.isFinite(unit.y) ||
      !Number.isFinite(unit.hp) ||
      unit.hp <= 0
    ) {
      continue;
    }

    // Copy only geometry data. Neither source records nor their ordering
    // are modified, and no input record is retained between calls.
    sites.push({
      x: unit.x,
      y: unit.y,
      side: unit.side === "human" ? HUMAN : DEMON,
      normalizedX: 0,
    });

    metricScale = Math.max(
      metricScale,
      Math.abs(unit.x - ORIGIN_X),
      Math.abs(unit.y - ORIGIN_Y),
    );

    minimumY = Math.min(minimumY, unit.y);
    maximumY = Math.max(maximumY, unit.y);
  }

  if (sites.length === 0) {
    return field;
  }

  sites.sort(
    (a, b) => a.x - b.x || a.y - b.y || a.side - b.side,
  );

  for (const site of sites) {
    site.normalizedX = (site.x - ORIGIN_X) / metricScale;
  }

  const size = field.cellSize;
  const normalizedStep = size / metricScale;

  // Center sampling with this floor keeps a point-sized troop from
  // falling between all sample centers at coarse resolutions.
  const radius = Math.max(
    requestedInfluence,
    size * Math.SQRT1_2,
  );

  const human = makeRow();
  const demon = makeRow();

  for (let rowIndex = 0; rowIndex < field.rows; rowIndex += 1) {
    const worldY =
      ORIGIN_Y + (firstRow + rowIndex + 0.5) * size;

    if (
      worldY < minimumY - radius ||
      worldY > maximumY + radius
    ) {
      continue;
    }

    resetRow(human, Infinity);
    resetRow(demon, -Infinity);

    for (const site of sites) {
      const dy = Math.abs(worldY - site.y);

      if (dy > radius) {
        continue;
      }

      const ratio = dy / radius;
      const cap =
        radius * Math.sqrt(Math.max(0, 1 - ratio * ratio));

      const row = site.side === HUMAN ? human : demon;

      row.left = Math.min(row.left, site.x - cap);
      row.right = Math.max(row.right, site.x + cap);
      row.spans.push([site.x-cap,site.x+cap]);

      if (site.side === HUMAN) {
        row.front = Math.min(row.front, site.x);
      } else {
        row.front = Math.max(row.front, site.x);
      }

      const normalizedDY = dy / metricScale;

      appendSite(
        row,
        site.normalizedX,
        normalizedDY * normalizedDY,
      );
    }

    if (human.xs.length === 0 && demon.xs.length === 0) {
      continue;
    }

    connectNearbySpans(human,requestedInfluence*.8);
    connectNearbySpans(demon,requestedInfluence*.8);

    const bothSidesPresent =
      human.xs.length > 0 && demon.xs.length > 0;

    // Humans advance left; demons advance right. This is used only
    // when the nearest actual troop distances are exactly equal.
    const tieBoundary = bothSidesPresent
      ? (human.front - ORIGIN_X) / metricScale / 2 +
        (demon.front - ORIGIN_X) / metricScale / 2
      : 0;

    const offset = rowIndex * field.cols;

    for (let col = 0; col < field.cols; col += 1) {
      const latticeX = firstCol + col + 0.5;
      const worldX = ORIGIN_X + latticeX * size;

      const humanHere =
        supported(human,worldX);

      const demonHere =
        supported(demon,worldX);

      if (!humanHere && !demonHere) {
        continue;
      }

      if (!demonHere) {
        field.cells[offset + col] = HUMAN;
        continue;
      }

      if (!humanHere) {
        field.cells[offset + col] = DEMON;
        continue;
      }

      const normalizedX = latticeX * normalizedStep;
      const humanCost = nearestCost(human, normalizedX);
      const demonCost = nearestCost(demon, normalizedX);

      if (humanCost < demonCost) {
        field.cells[offset + col] = HUMAN;
      } else if (demonCost < humanCost) {
        field.cells[offset + col] = DEMON;
      } else if (normalizedX < tieBoundary) {
        field.cells[offset + col] = DEMON;
      } else if (normalizedX > tieBoundary) {
        field.cells[offset + col] = HUMAN;
      } else {
        // This final convention also mirrors under x reflection and
        // side swapping. The world center is a grid boundary, not an
        // ordinary cell center, so it does not create a neutral column.
        field.cells[offset + col] =
          normalizedX < 0
            ? DEMON
            : normalizedX > 0
              ? HUMAN
              : 0;
      }
    }
  }

  return field;
}

// Independent fronts use bounded local influence, never a span joining distant
// armies. Work is limited to circles around units, not cells times all units.
function multiFactionField(field,units,influence){
 const teams=[null,'human','demon',...new Set(units.filter(u=>u?.faction&&u.hp>0).map(u=>u.faction).sort())].slice(0,255),indices=new Map(teams.map((t,i)=>[t,i])),scores=new Float64Array(field.cells.length).fill(Infinity),s=field.cellSize,r=Math.min(1000,influence),r2=r*r;
 field.teams=teams;
 for(const u of units){const value=indices.get(u?.faction||u?.side);if(!value||!(u.hp>0)||!Number.isFinite(u.x)||!Number.isFinite(u.y))continue;
  const x0=Math.max(0,Math.floor((u.x-r-field.x)/s)),x1=Math.min(field.cols-1,Math.floor((u.x+r-field.x)/s)),y0=Math.max(0,Math.floor((u.y-r-field.y)/s)),y1=Math.min(field.rows-1,Math.floor((u.y+r-field.y)/s));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const d=(field.x+(x+.5)*s-u.x)**2+(field.y+(y+.5)*s-u.y)**2,i=y*field.cols+x;if(d>r2)continue;if(d<scores[i]||d===scores[i]&&value<field.cells[i]){scores[i]=d;field.cells[i]=value;}}
 }
 return field;
}
