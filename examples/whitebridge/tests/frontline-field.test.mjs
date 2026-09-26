#!/usr/bin/env node

import test from "node:test";
import assert from "node:assert/strict";

import { buildFrontlineField } from
  "../modules/pixel-war/public/frontline-field.mjs";

const WORLD_WIDTH = 20480;
const WORLD_HEIGHT = 2304;
const ORIGIN_X = WORLD_WIDTH / 2;
const ORIGIN_Y = WORLD_HEIGHT / 2;
const MAX_CELLS = 24000;

const VIEW = Object.freeze({
  x: ORIGIN_X,
  y: ORIGIN_Y,
  w: 4800,
  h: 1536,
});

function troop(id, side, x, y, extra = {}) {
  return {
    id,
    side,
    kind: "soldier",
    x,
    y,
    hp: 100,
    ...extra,
  };
}

function fieldFor(units, overrides = {}) {
  return buildFrontlineField({
    units,
    view: VIEW,
    ...overrides,
  });
}

function indexAt(field, x, y) {
  const col = Math.floor((x - field.x) / field.cellSize);
  const row = Math.floor((y - field.y) / field.cellSize);

  assert.ok(
    col >= 0 &&
      col < field.cols &&
      row >= 0 &&
      row < field.rows,
    `Sample (${x}, ${y}) must be inside the returned grid`,
  );

  return row * field.cols + col;
}

function at(field, x, y) {
  return field.cells[indexAt(field, x, y)];
}

function rowAt(field, y) {
  const row = Math.floor((y - field.y) / field.cellSize);

  assert.ok(row >= 0 && row < field.rows);

  return field.cells.slice(
    row * field.cols,
    (row + 1) * field.cols,
  );
}

function countColor(field, color) {
  let count = 0;

  for (const value of field.cells) {
    if (value === color) {
      count += 1;
    }
  }

  return count;
}

function assertLegalField(field) {
  assert.ok(field.cells instanceof Uint8Array);
  assert.ok(Number.isFinite(field.cellSize));
  assert.ok(field.cellSize > 0);
  assert.ok(Number.isInteger(field.cols));
  assert.ok(Number.isInteger(field.rows));
  assert.ok(field.cols >= 0);
  assert.ok(field.rows >= 0);
  assert.equal(field.cells.length, field.cols * field.rows);
  assert.ok(field.cells.length <= MAX_CELLS);

  for (const value of field.cells) {
    assert.ok(value === 0 || value === 1 || value === 2);
  }
}

function assertTouchingRun(values, firstColor, lastColor) {
  assert.ok(values.length >= 2);
  assert.equal(values[0], firstColor);
  assert.equal(values[values.length - 1], lastColor);

  let transitions = 0;

  for (let i = 0; i < values.length; i += 1) {
    assert.ok(
      values[i] === 1 || values[i] === 2,
      "Combat must not contain an unclaimed slit",
    );

    if (i > 0 && values[i] !== values[i - 1]) {
      transitions += 1;
    }
  }

  assert.equal(transitions, 1);
}

function swapColor(color) {
  return color === 1 ? 2 : color === 2 ? 1 : 0;
}

test("bridge troops do not color distant top or bottom regions", () => {
  const field = fieldFor(
    [
      troop("h1", "human", 10800, 1130),
      troop("h2", "human", 11000, 1170),
      troop("d1", "demon", 9650, 1140),
      troop("d2", "demon", 9800, 1160),
    ],
    {
      view: {
        x: ORIGIN_X,
        y: ORIGIN_Y,
        w: 4800,
        h: WORLD_HEIGHT,
      },
    },
  );

  assertLegalField(field);
  assert.equal(at(field, 10800, 1152), 1);
  assert.equal(at(field, 9800, 1152), 2);

  for (let row = 0; row < field.rows; row += 1) {
    const y = field.y + (row + 0.5) * field.cellSize;

    if (Math.abs(y - 1152) > 210) {
      const values = field.cells.subarray(
        row * field.cols,
        (row + 1) * field.cols,
      );

      assert.ok(
        values.every((value) => value === 0),
        `Unsupported lateral row at y=${y} must remain empty`,
      );
    }
  }
});

test("an isolated hero creates a local pocket, not a 1400-unit strip", () => {
  const field = fieldFor([
    troop("rear", "human", 10800, 1152),
    troop("near-rear", "human", 10780, 1160),
    troop("forward-hero", "human", 9400, 1152, {
      kind: "hero",
    }),
    troop("other-lane", "human", 10800, 1650),
  ]);

  for (const x of [9400, 10800]) {
    assert.equal(at(field, x, 1152), 1);
  }

  for(const x of [9600,10000,10400])assert.equal(at(field,x,1152),0);
  assert.equal(at(field, 9000, 1152), 0);
  assert.equal(at(field, 11200, 1152), 0);
  assert.equal(at(field, 12000, 1152), 0);

  assert.equal(at(field, 10800, 1650), 1);
  assert.equal(at(field, 10000, 1650), 0);
  assert.equal(at(field, 10000, 700), 0);
});

test("distant offscreen endpoints cannot paint an unoccupied viewport", () => {
  const field = fieldFor(
    [
      troop("forward", "human", 9400, 1152),
      troop("rear", "human", 10800, 1152),
    ],
    {
      view: { x: 10100, y: 1152, w: 480, h: 480 },
    },
  );

  assert.ok(9400 < field.x);
  assert.ok(10800 > field.x + field.cols * field.cellSize);

  assert.ok(
    rowAt(field, 1152).every((value) => value === 0),
    "An empty distant gap is not occupied territory",
  );
});

test("retreat immediately shrinks the lane without permanent ownership", () => {
  const before = fieldFor([
    troop("rear", "human", 10800, 1152),
    troop("forward", "human", 9400, 1152),
  ]);

  const after = fieldFor([
    troop("rear", "human", 10800, 1152),
    troop("forward", "human", 10400, 1152),
  ]);

  assert.equal(at(before, 9500, 1152), 1);
  assert.equal(at(after, 9500, 1152), 0);
  assert.equal(at(before, 10000, 1152), 0);
  assert.equal(at(after, 10000, 1152), 0);
  assert.equal(at(after, 10600, 1152), 1);
  assert.equal(at(after, 10800, 1152), 1);

  assert.equal(at(after, 10400, 1152), 1);
});

test("separated lateral lanes are not convex-hulled together", () => {
  const field = fieldFor([
    troop("upper-front", "human", 9400, 600),
    troop("upper-rear", "human", 10800, 600),
    troop("lower-front", "human", 9700, 1700),
    troop("lower-rear", "human", 10800, 1700),
  ]);

  assert.equal(at(field, 9400, 600), 1);
  assert.equal(at(field, 9700, 1700), 1);

  assert.ok(
    rowAt(field, 1152).every((value) => value === 0),
    "The unsupported gap between lanes must remain empty",
  );
});

test("horizontal melee has adjacent colors even with a farther forward troop", () => {
  const field = fieldFor([
    troop("d-melee", "demon", 10000, 1152),
    troop("h-melee", "human", 10060, 1152),
    troop("h-far-forward", "human", 9400, 1152),
    troop("h-rear", "human", 10800, 1152),
  ]);

  assert.equal(at(field, 10000, 1152), 2);
  assert.equal(at(field, 10060, 1152), 1);

  const first = indexAt(field, 10000, 1152);
  const last = indexAt(field, 10060, 1152);

  assertTouchingRun(field.cells.slice(first, last + 1), 2, 1);
});

test("vertical melee also has a touching boundary without a neutral slit", () => {
  const field = fieldFor([
    troop("d", "demon", 10012, 1128),
    troop("h", "human", 10012, 1176),
  ]);

  const col = Math.floor((10012 - field.x) / field.cellSize);
  const firstRow = Math.floor(
    (1128 - field.y) / field.cellSize,
  );
  const lastRow = Math.floor(
    (1176 - field.y) / field.cellSize,
  );

  const values = [];

  for (let row = firstRow; row <= lastRow; row += 1) {
    values.push(field.cells[row * field.cols + col]);
  }

  assertTouchingRun(values, 2, 1);
});

test("coincident opponents produce a boundary, not a thick neutral tie region", () => {
  const field = fieldFor([
    troop("h", "human", 10012, 1152),
    troop("d", "demon", 10012, 1152),
  ]);

  const values = rowAt(field, 1152);
  const first = values.findIndex((value) => value !== 0);

  let last = values.length - 1;

  while (last >= 0 && values[last] === 0) {
    last -= 1;
  }

  assert.ok(first >= 0);
  assert.ok(last > first);
  assertTouchingRun(values.slice(first, last + 1), 2, 1);
});

test("dead and neutral troops leave no ghosts in subsequent calls", () => {
  const rear = troop("rear", "human", 10800, 1152);
  const forward = troop("forward", "human", 9400, 1152);

  const live = fieldFor([rear, forward]);
  assert.equal(at(live, 9400, 1152), 1);

  const afterDeath = fieldFor([
    rear,
    { ...forward, hp: 0 },
    troop("neutral", "neutral", 9400, 1152),
  ]);

  assert.equal(at(afterDeath, 9400, 1152), 0);
  assert.equal(at(afterDeath, 10800, 1152), 1);

  const nobodyAlive = fieldFor([
    { ...rear, hp: -10 },
    { ...forward, hp: 0 },
    troop("neutral", "neutral", 10000, 1152),
  ]);

  assert.ok(nobodyAlive.cells.every((value) => value === 0));
  assert.ok(fieldFor([]).cells.every((value) => value === 0));
});

test("world-grid alignment and shared cells remain stable as the camera moves", () => {
  const units = [
    troop("h-front", "human", 9400, 1152),
    troop("h-rear", "human", 10800, 1170),
    troop("d", "demon", 9880, 1130),
    troop("lower", "human", 10600, 1550),
  ];

  const view = { x: 10000, y: 1152, w: 2400, h: 960 };
  const original = fieldFor(units, { view });

  for (const [dx, dy] of [[17, 11], [57, -35]]) {
    const moved = fieldFor(units, {
      view: { ...view, x: view.x + dx, y: view.y + dy },
    });

    assert.equal(moved.cellSize, original.cellSize);

    for (const field of [original, moved]) {
      assert.ok(
        Number.isInteger(
          (field.x - ORIGIN_X) / field.cellSize,
        ),
      );
      assert.ok(
        Number.isInteger(
          (field.y - ORIGIN_Y) / field.cellSize,
        ),
      );
    }

    assert.ok(
      Number.isInteger(
        (moved.x - original.x) / original.cellSize,
      ),
    );
    assert.ok(
      Number.isInteger(
        (moved.y - original.y) / original.cellSize,
      ),
    );

    let compared = 0;

    for (let row = 0; row < original.rows; row += 1) {
      for (let col = 0; col < original.cols; col += 1) {
        const x =
          original.x + (col + 0.5) * original.cellSize;
        const y =
          original.y + (row + 0.5) * original.cellSize;

        const movedCol = Math.floor(
          (x - moved.x) / moved.cellSize,
        );
        const movedRow = Math.floor(
          (y - moved.y) / moved.cellSize,
        );

        if (
          movedCol < 0 ||
          movedCol >= moved.cols ||
          movedRow < 0 ||
          movedRow >= moved.rows
        ) {
          continue;
        }

        assert.equal(
          original.cells[row * original.cols + col],
          moved.cells[movedRow * moved.cols + movedCol],
          `Camera movement changed the cell at (${x}, ${y})`,
        );

        compared += 1;
      }
    }

    assert.ok(compared > 0);
  }
});

test("mirroring x and swapping sides exactly mirrors the default-size grid", () => {
  const units = [
    troop("h1", "human", 10720, 1136),
    troop("h2", "human", 11080, 1184),
    troop("h3", "human", 9670, 1472),
    troop("d1", "demon", 9820, 1152),
    troop("d2", "demon", 10210, 1216),
    troop("d3", "demon", 9450, 1456),
    troop("tie-h", "human", 10468, 1008),
    troop("tie-d", "demon", 10468, 1008),
    troop("ignored", "neutral", 10100, 1152),
  ];

  const view = {
    x: 10183,
    y: 1187,
    w: 2457,
    h: 923,
  };

  const mirroredUnits = units.map((unit) => ({
    ...unit,
    x: WORLD_WIDTH - unit.x,
    side:
      unit.side === "human"
        ? "demon"
        : unit.side === "demon"
          ? "human"
          : "neutral",
  }));

  const original = fieldFor(units, { view });
  const mirrored = fieldFor(mirroredUnits, {
    view: { ...view, x: WORLD_WIDTH - view.x },
  });

  assert.equal(original.cellSize, 24);
  assert.equal(mirrored.cellSize, original.cellSize);
  assert.equal(mirrored.cols, original.cols);
  assert.equal(mirrored.rows, original.rows);
  assert.equal(mirrored.y, original.y);

  assert.equal(
    mirrored.x,
    WORLD_WIDTH -
      (original.x + original.cols * original.cellSize),
  );

  for (let row = 0; row < original.rows; row += 1) {
    for (let col = 0; col < original.cols; col += 1) {
      const originalValue =
        original.cells[row * original.cols + col];

      const mirroredValue =
        mirrored.cells[
          row * mirrored.cols + mirrored.cols - 1 - col
        ];

      assert.equal(
        mirroredValue,
        swapColor(originalValue),
        `Reflection mismatch at row ${row}, column ${col}`,
      );
    }
  }
});

test("malformed records, invalid sides, and non-finite numbers are ignored", () => {
  const valid = troop("valid", "human", 10800, 1152);
  const badBase = troop("bad", "human", 9400, 1152);

  const malformed = [
    null,
    undefined,
    false,
    7,
    "soldier",
    {},
    [],
    { ...badBase, x: NaN },
    { ...badBase, x: Infinity },
    { ...badBase, x: -Infinity },
    { ...badBase, y: NaN },
    { ...badBase, y: Infinity },
    { ...badBase, y: -Infinity },
    { ...badBase, hp: NaN },
    { ...badBase, hp: Infinity },
    { ...badBase, hp: -Infinity },
    { ...badBase, hp: 0 },
    { ...badBase, hp: -1 },
    { ...badBase, hp: "100" },
    { ...badBase, x: "9400" },
    { ...badBase, y: undefined },
    { ...badBase, side: "neutral" },
    { ...badBase, side: "HUMAN" },
    { ...badBase, side: "other" },
    { ...badBase, side: undefined },
  ];

  assert.deepEqual(
    fieldFor([valid, ...malformed]),
    fieldFor([valid]),
  );

  assert.ok(
    fieldFor(null).cells.every((value) => value === 0),
  );
  assert.ok(
    fieldFor({ 0: valid, length: 1 }).cells.every(
      (value) => value === 0,
    ),
  );
});

test("huge viewports and tiny requested cell sizes stay within the cell budget", () => {
  const view = {
    x: ORIGIN_X,
    y: ORIGIN_Y,
    w: Number.MAX_VALUE,
    h: Number.MAX_VALUE,
  };

  for (const requestedSize of [
    24,
    1,
    0.001,
    Number.MIN_VALUE,
  ]) {
    const field = fieldFor(
      [troop("h", "human", 10800, 1152)],
      { view, cellSize: requestedSize },
    );

    assertLegalField(field);
    assert.ok(field.cells.length > 0);
    assert.ok(field.cellSize >= requestedSize);

    assert.ok(field.x <= 0);
    assert.ok(field.y <= 0);

    assert.ok(
      field.x + field.cols * field.cellSize >= WORLD_WIDTH,
    );
    assert.ok(
      field.y + field.rows * field.cellSize >= WORLD_HEIGHT,
    );

    assert.ok(countColor(field, 1) > 0);
  }
});

test("invalid or nonintersecting views return an empty typed field", () => {
  const units = [troop("h", "human", 10800, 1152)];

  const invalidViews = [
    undefined,
    null,
    {},
    { ...VIEW, x: NaN },
    { ...VIEW, y: Infinity },
    { ...VIEW, w: Infinity },
    { ...VIEW, w: 0 },
    { ...VIEW, h: -1 },
    { x: -5000, y: 1152, w: 20, h: 20 },
    { x: 30000, y: 1152, w: 20, h: 20 },
  ];

  for (const view of invalidViews) {
    const field = buildFrontlineField({ units, view });

    assertLegalField(field);
    assert.equal(field.cols, 0);
    assert.equal(field.rows, 0);
    assert.equal(field.cells.length, 0);
  }

  assert.equal(buildFrontlineField().cells.length, 0);
});

test("invalid tuning parameters use defaults", () => {
  const units = [
    troop("h", "human", 10800, 1152),
    troop("d", "demon", 10000, 1152),
  ];

  const expected = fieldFor(units);

  for (const cellSize of [0, -1, NaN, Infinity, "24"]) {
    assert.deepEqual(
      fieldFor(units, { cellSize }),
      expected,
    );
  }

  for (const influence of [-1, NaN, Infinity, "150"]) {
    assert.deepEqual(
      fieldFor(units, { influence }),
      expected,
    );
  }
});

test("zero influence still rasterizes a sub-cell troop without a large patch", () => {
  // This position is exactly a center on the default world lattice.
  const field = fieldFor(
    [troop("point", "human", 10012, 1164)],
    { influence: 0 },
  );

  assert.equal(at(field, 10012, 1164), 1);
  assert.equal(countColor(field, 1), 1);
});

test("inputs are not mutated, ordering is irrelevant, and outputs are independent", () => {
  const source = [
    troop("h1", "human", 10800, 1152),
    troop("h2", "human", 9400, 1160),
    troop("h3", "human", 10400, 1200, { kind: "hero" }),
    troop("h4", "human", 10400, 1110),
    troop("d1", "demon", 10000, 1152),
    troop("d2", "demon", 10000, 1190),
    troop("d3", "demon", 10300, 1200),
  ];

  const snapshot = source.map((unit) => ({ ...unit }));

  const units = Object.freeze(
    source.map((unit) => Object.freeze({ ...unit })),
  );

  const view = Object.freeze({ ...VIEW });

  const options = Object.freeze({ units, view });
  const expected = buildFrontlineField(options);
  const savedCells = expected.cells.slice();

  const permutations = [
    [...units].reverse(),
    [...units.slice(3), ...units.slice(0, 3)],
    [units[2], units[0], units[6], units[1], units[3], units[5], units[4]],
  ];

  for (const permutation of permutations) {
    assert.deepEqual(
      buildFrontlineField({ units: permutation, view }),
      expected,
    );
  }

  assert.deepEqual(units, snapshot);
  assert.deepEqual(view, VIEW);

  expected.cells.fill(99);

  const fresh = buildFrontlineField(options);

  assert.deepEqual(fresh.cells, savedCells);
  assert.notEqual(fresh.cells.buffer, expected.cells.buffer);
  assert.deepEqual(units, snapshot);
});

test("nearest-site envelopes agree with a brute-force per-cell reference", () => {
  const units = [
    troop("h1", "human", 10300, 1140),
    troop("h2", "human", 10300, 1100),
    troop("h3", "human", 10600, 1180),
    troop("h4", "human", 9840, 1280),
    troop("d1", "demon", 10080, 1160),
    troop("d2", "demon", 10080, 1220),
    troop("d3", "demon", 9920, 1110),
    troop("d4", "demon", 10480, 1280),
    troop("tie-h", "human", 10160, 1168),
    troop("tie-d", "demon", 10160, 1168),
  ];

  const influence = 180;

  const field = fieldFor(units, {
    view: { x: 10240, y: 1152, w: 960, h: 480 },
    cellSize: 32,
    influence,
  });

  const radius = Math.max(
    influence,
    field.cellSize * Math.SQRT1_2,
  );

  function sideInfo(side, x, y) {
    const spans=[];
    let nearest = Infinity;
    let front = side === "human" ? Infinity : -Infinity;

    for (const unit of units) {
      if (unit.side !== side) {
        continue;
      }

      const dy = Math.abs(y - unit.y);

      if (dy > radius) {
        continue;
      }

      const ratio = dy / radius;
      const cap =
        radius * Math.sqrt(Math.max(0, 1 - ratio * ratio));

      spans.push([unit.x-cap,unit.x+cap]);

      const dx = x - unit.x;
      nearest = Math.min(nearest, dx * dx + dy * dy);

      front =
        side === "human"
          ? Math.min(front, unit.x)
          : Math.max(front, unit.x);
    }

    return {
      covered: spans.some(([a,b])=>a<=x&&x<=b)||spans.some(([a,b])=>b<x&&spans.some(([c,d])=>c>x&&c-b<=influence*.8)),
      nearest,
      front,
    };
  }

  function referenceAt(x, y) {
    const human = sideInfo("human", x, y);
    const demon = sideInfo("demon", x, y);

    if (!human.covered && !demon.covered) {
      return 0;
    }
    if (!demon.covered) {
      return 1;
    }
    if (!human.covered) {
      return 2;
    }

    if (human.nearest < demon.nearest) {
      return 1;
    }
    if (demon.nearest < human.nearest) {
      return 2;
    }

    const boundary = human.front / 2 + demon.front / 2;

    if (x < boundary) {
      return 2;
    }
    if (x > boundary) {
      return 1;
    }

    return x < ORIGIN_X ? 2 : x > ORIGIN_X ? 1 : 0;
  }

  for (let row = 0; row < field.rows; row += 1) {
    for (let col = 0; col < field.cols; col += 1) {
      const x = field.x + (col + 0.5) * field.cellSize;
      const y = field.y + (row + 0.5) * field.cellSize;

      assert.equal(
        field.cells[row * field.cols + col],
        referenceAt(x, y),
        `Nearest-site mismatch at (${x}, ${y})`,
      );
    }
  }
});

test("600 mixed troops produce a bounded, order-independent field", () => {
  const units = Array.from({ length: 600 }, (_, index) =>
    troop(
      `unit-${index}`,
      index % 2 === 0 ? "human" : "demon",
      9000 + ((index * 97) % 2400),
      200 + ((index * 53) % 1900),
      { kind: index % 37 === 0 ? "hero" : "soldier" },
    ),
  );

  const view = {
    x: ORIGIN_X,
    y: ORIGIN_Y,
    w: 4096,
    h: 1536,
  };

  const field = fieldFor(units, { view });

  assertLegalField(field);
  assert.ok(field.cells.length >= 10000);
  assert.ok(countColor(field, 1) > 0);
  assert.ok(countColor(field, 2) > 0);

  assert.deepEqual(
    fieldFor([...units].reverse(), { view }),
    field,
  );
});

 test('a real marching chain remains connected without filling distant empty ground',()=>{const units=Array.from({length:6},(_,i)=>troop('march'+i,'demon',9600+i*240,1152));const field=fieldFor(units);for(let x=9600;x<=10800;x+=24)assert.equal(at(field,x,1152),2);assert.equal(at(field,11300,1152),0);});
