import test from 'node:test';
import assert from 'node:assert/strict';

import {
  UnitMarkerTracker,
} from '../modules/pixel-war/public/unit-marker-tracker.mjs';

const EPSILON = 1e-7;

function makeCamera(overrides = {}) {
  return {
    screenW: 960,
    screenH: 540,
    zoom: 1,
    x: 480,
    y: 270,

    project(point) {
      return {
        x: (point.x - this.x) * this.zoom + this.screenW / 2,
        y: (point.y - this.y) * this.zoom + this.screenH / 2,
      };
    },

    ...overrides,
  };
}

function makeUnit(id, overrides = {}) {
  return {
    id,
    life: 1,
    side: 'human',
    kind: 'soldier',
    hp: 100,
    source: 'test',
    supporter: {
      id: 'shared-owner',
      name: 'Viewer',
      platform: 'test',
      avatarKey: 'shared-avatar',
    },
    x: 480,
    y: 320,
    scale: 1,
    machine: false,
    level: 3,
    ...overrides,
  };
}

function byId(markers) {
  return new Map(markers.map(marker => [marker.unitId, marker]));
}

function byKey(markers) {
  return new Map(markers.map(marker => [marker.key, marker]));
}

function approximately(actual, expected, tolerance = EPSILON) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

function effectiveDt(dt) {
  return Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.05) : 0;
}

function assertBounded(previous, current, dt) {
  const distance = Math.hypot(
    current.x - previous.x,
    current.y - previous.y,
  );

  assert.ok(
    distance <= 900 * effectiveDt(dt) + EPSILON,
    `Marker moved ${distance}px with dt=${String(dt)}`,
  );
}

function assertFiniteMarker(marker) {
  for (const field of ['x', 'y', 'angle', 'alpha']) {
    assert.ok(
      Number.isFinite(marker[field]),
      `${field} must be finite`,
    );
  }

  assert.ok(marker.alpha >= 0 && marker.alpha <= 1);
  assert.equal(typeof marker.key, 'string');
  assert.equal(typeof marker.offscreen, 'boolean');
}

function assertPointsToward(marker, projected) {
  const dx = projected.x - marker.x;
  const dy = projected.y - marker.y;
  const distance = Math.hypot(dx, dy);

  assert.ok(distance > 0);
  approximately(Math.cos(marker.angle), dx / distance);
  approximately(Math.sin(marker.angle), dy / distance);
}

function onBoundary(point, rect) {
  const inside = (
    point.x >= rect.left - EPSILON
    && point.x <= rect.right + EPSILON
    && point.y >= rect.top - EPSILON
    && point.y <= rect.bottom + EPSILON
  );

  const boundaryDistance = Math.min(
    Math.abs(point.x - rect.left),
    Math.abs(point.x - rect.right),
    Math.abs(point.y - rect.top),
    Math.abs(point.y - rect.bottom),
  );

  return inside && boundaryDistance <= EPSILON;
}

function deepFreeze(value) {
  if (
    value
    && typeof value === 'object'
    && !Object.isFrozen(value)
  ) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }

  return value;
}

function permuted(values, frame) {
  const result = values.slice().reverse();
  if (result.length === 0) return result;

  const offset = frame % result.length;
  return result.slice(offset).concat(result.slice(0, offset));
}

test('returns one marker per eligible live unit, including shared owners and neutral beasts', () => {
  const tracker = new UnitMarkerTracker();
  const camera = makeCamera();

  const eligibleUnits = [
    makeUnit('viewer-a'),
    makeUnit('viewer-b', { x: 700 }),
    makeUnit('edge-viewer', { x: 6000 }),
    makeUnit('bilibili', { source: 'bilibili', side: 'demon' }),
    makeUnit('xiaohongshu', { source: 'xiaohongshu' }),
    makeUnit('neutral-beast', { side: 'neutral', kind: 'beast' }),
    makeUnit('numeric-owner', {
      supporter: {
        id: 0,
        name: 'Zero',
        platform: 'test',
        avatarKey: 'zero',
      },
    }),
    // Eligibility is controlled by source, not supporter.platform.
    makeUnit('test-platform-system', {
      supporter: {
        id: 'test-owner',
        name: 'Test',
        platform: 'system',
        avatarKey: 'test',
      },
    }),
  ];

  const ineligibleUnits = [
    makeUnit('dead', { hp: 0 }),
    makeUnit('negative-hp', { hp: -1 }),
    makeUnit('hero', { kind: 'hero' }),
    makeUnit('unsupported-source', { source: 'system' }),
    makeUnit('missing-source', { source: undefined }),
    makeUnit('no-supporter', { supporter: null }),
    makeUnit('missing-owner-id', { supporter: { name: 'Anonymous' } }),
    makeUnit('empty-owner-id', { supporter: { id: '' } }),
  ];

  const markers = tracker.update(
    [...eligibleUnits, ...ineligibleUnits],
    camera,
    1 / 60,
  );

  assert.equal(markers.length, eligibleUnits.length);
  assert.equal(new Set(markers.map(marker => marker.key)).size, markers.length);

  assert.deepEqual(
    new Set(markers.map(marker => marker.unitId)),
    new Set(eligibleUnits.map(unit => unit.id)),
  );

  const neutral = byId(markers).get('neutral-beast');
  assert.equal(neutral.side, 'neutral');
  assert.equal(neutral.kind, 'beast');

  for (const marker of markers) assertFiniteMarker(marker);

  assert.deepEqual(
    Object.keys(markers[0]).sort(),
    [
      'commander', 'factionColor', 'factionName', 'hp', 'maxHP',
      'key',
      'unitId',
      'life',
      'owner',
      'side',
      'kind',
      'level',
      'x',
      'y',
      'offscreen',
      'angle',
      'alpha',
    ].sort(),
  );
});

test('keys distinguish tuple components and do not depend on owner or array order', () => {
  const tracker = new UnitMarkerTracker();
  const camera = makeCamera();

  const units = [
    makeUnit('a:1', { life: 2 }),
    makeUnit('a', { life: '1:2' }),
    makeUnit(1, { life: 0 }),
    makeUnit('1', { life: 0 }),
  ];

  const first = tracker.update(units, camera, 0);
  const previous = byId(first);

  assert.equal(new Set(first.map(marker => marker.key)).size, units.length);

  const changed = units.slice().reverse().map(unit => ({
    ...unit,
    x: unit.x + 100,
    level: 9,
    supporter: {
      id: 'different-owner',
      name: 'Renamed',
      platform: 'bilibili',
      avatarKey: 'new-avatar',
    },
  }));

  const next = tracker.update(changed, camera, 0);

  for (const marker of next) {
    const old = previous.get(marker.unitId);
    assert.equal(marker.key, old.key);
    assert.equal(marker.x, old.x);
    assert.equal(marker.y, old.y);
    assert.equal(marker.owner.id, 'different-owner');
    assert.equal(marker.level, 9);
  }
});

test('head centers match the supplied non-hero bodyBox geometry and camera zoom', () => {
  const tracker = new UnitMarkerTracker();
  const camera = makeCamera({ zoom: 0.8 });

  // Each unit projects to (480, 310). The center is bodyBox.y - 12.
  const units = [
    makeUnit('ordinary', { scale: 1.5 }),
    makeUnit('machine', { scale: 1.5, machine: true }),
    makeUnit('dreadnought', {
      scale: 1.5,
      machine: true,
      kind: 'dreadnought',
    }),
    makeUnit('non-machine-dreadnought', {
      scale: 1.5,
      machine: false,
      kind: 'dreadnought',
    }),
    makeUnit('zero-scale-fallback', { scale: 0 }),
  ];

  const markers = byId(tracker.update(units, camera, 0));

  const expectedY = new Map([
    ['ordinary', 223],
    ['machine', 220.6],
    ['dreadnought', 169],
    ['non-machine-dreadnought', 223],
    ['zero-scale-fallback', 247],
  ]);

  for (const [id, y] of expectedY) {
    const marker = markers.get(id);
    approximately(marker.x, 480);
    approximately(marker.y, y);
    assert.equal(marker.offscreen, false);
  }
});

test('HUD clamping alone does not classify an onscreen unit as offscreen', () => {
  const tracker = new UnitMarkerTracker();
  const camera = makeCamera();

  const units = [
    makeUnit('hud', { x: 480, y: 90 }),
    makeUnit('left-boundary', { x: 20, y: 250 }),
    makeUnit('right-boundary', { x: 940, y: 250 }),
    makeUnit('top-boundary', { x: 480, y: 85 }),
    makeUnit('bottom-boundary', { x: 480, y: 450 }),
    makeUnit('outside-left', { x: 19.99, y: 250 }),
    makeUnit('outside-right', { x: 940.01, y: 250 }),
    makeUnit('outside-top', { x: 480, y: 84.99 }),
    makeUnit('outside-bottom', { x: 480, y: 450.01 }),
  ];

  const markers = byId(tracker.update(units, camera, 0));

  for (const id of [
    'hud',
    'left-boundary',
    'right-boundary',
    'top-boundary',
    'bottom-boundary',
  ]) {
    assert.equal(markers.get(id).offscreen, false, id);
  }

  for (const id of [
    'outside-left',
    'outside-right',
    'outside-top',
    'outside-bottom',
  ]) {
    assert.equal(markers.get(id).offscreen, true, id);
  }

  approximately(markers.get('hud').y, 85);
});

test('uses project() with its receiver and snapshots reused projection objects', () => {
  const scratch = { x: 0, y: 0 };
  let calls = 0;

  const camera = makeCamera({
    offsetX: 40,

    project(point) {
      calls += 1;
      scratch.x = point.x + this.offsetX;
      scratch.y = point.y;
      return scratch;
    },
  });

  const units = [
    makeUnit('a', { x: 200, y: 300 }),
    makeUnit('b', { x: 500, y: 350 }),
  ];

  const markers = byId(
    new UnitMarkerTracker().update(units, camera, 0),
  );

  assert.equal(calls, 2);
  approximately(markers.get('a').x, 240);
  approximately(markers.get('a').y, 225);
  approximately(markers.get('b').x, 540);
  approximately(markers.get('b').y, 275);
});

test('does not mutate frozen inputs or expose animation state through returned objects', () => {
  const tracker = new UnitMarkerTracker();
  const camera = deepFreeze(makeCamera());
  const units = deepFreeze([makeUnit('frozen')]);

  const first = tracker.update(units, camera, 0);
  const originalX = first[0].x;
  const originalY = first[0].y;

  first[0].x = -999;
  first[0].y = -999;
  first[0].alpha = 1;
  first[0].key = 'tampered';
  first[0].owner.name = 'Tampered';
  first.push({ key: 'extra' });

  const second = tracker.update(units, camera, 0);

  assert.equal(second.length, 1);
  assert.equal(second[0].x, originalX);
  assert.equal(second[0].y, originalY);
  assert.equal(second[0].alpha, 0);
  assert.notEqual(second[0].key, 'tampered');
  assert.equal(second[0].owner.name, 'Viewer');
  assert.equal(units[0].supporter.name, 'Viewer');
  assert.notStrictEqual(second[0].owner, units[0].supporter);
});

test('same-owner onscreen units follow independently without representative switching', () => {
  const tracker = new UnitMarkerTracker();
  const camera = makeCamera();

  const stationary = makeUnit('stationary', { x: 650, y: 320 });
  let moving = makeUnit('moving', { x: 250, y: 340 });

  let previous = byId(
    tracker.update([moving, stationary], camera, 0),
  );

  const stationaryPosition = {
    x: previous.get('stationary').x,
    y: previous.get('stationary').y,
  };
  const movingKey = previous.get('moving').key;

  for (let frame = 0; frame < 60; frame += 1) {
    moving = { ...moving, x: moving.x + 3 };

    const current = byId(
      tracker.update([stationary, moving], camera, 1 / 60),
    );

    assertBounded(previous.get('moving'), current.get('moving'), 1 / 60);
    assert.equal(current.get('moving').key, movingKey);
    assert.equal(current.get('stationary').x, stationaryPosition.x);
    assert.equal(current.get('stationary').y, stationaryPosition.y);
    previous = current;
  }

  const forward = previous.get('moving');
  assert.ok(forward.x <= moving.x + EPSILON);
  assert.ok(moving.x - forward.x < 16);

  for (let frame = 0; frame < 60; frame += 1) {
    moving = { ...moving, x: moving.x - 3 };

    const current = byId(
      tracker.update([moving, stationary], camera, 1 / 60),
    );

    assertBounded(previous.get('moving'), current.get('moving'), 1 / 60);
    assert.equal(current.get('moving').key, movingKey);
    previous = current;
  }

  const reversed = previous.get('moving');
  assert.ok(reversed.x >= moving.x - EPSILON);
  assert.ok(reversed.x - moving.x < 16);
  assert.ok(reversed.alpha > 0.99);
});

test('edge crossings remain bounded and deterministic under permutation, joins, and deaths', () => {
  const a = new UnitMarkerTracker();
  const b = new UnitMarkerTracker();
  const camera = makeCamera();
  const edgeXs = [934, 938, 941, 946, 952, 944, 939, 935];
  const dts = [1 / 60, 1 / 120, 0.05];

  let previous = new Map();
  let sawOnscreen = false;
  let sawOffscreen = false;

  for (let frame = 0; frame < 56; frame += 1) {
    let units = Array.from({ length: 8 }, (_, index) => (
      makeUnit(`original-${index}`, {
        x: edgeXs[frame % edgeXs.length] + index * 0.1,
        y: 240 + (index % 4) * 30,
      })
    ));

    if (frame >= 5) {
      units.push(makeUnit('new-a', { x: 4000, y: 280 }));
    }

    if (frame >= 12) {
      units.push(makeUnit('new-b', { x: 4500, y: 300 }));
    }

    if (frame >= 18) {
      units = units.filter(unit => unit.id !== 'original-2');
    }

    const dt = dts[frame % dts.length];
    const resultA = a.update(units, camera, dt);
    const resultB = b.update(permuted(units, frame), camera, dt);

    assert.deepEqual(resultA, resultB);
    assert.equal(resultA.length, units.length);

    for (const marker of resultA) {
      const old = previous.get(marker.key);
      if (old) {
        assertBounded(old, marker, dt);
        assert.ok(marker.alpha >= old.alpha);
      }

      if (marker.unitId === 'original-0') {
        sawOnscreen ||= !marker.offscreen;
        sawOffscreen ||= marker.offscreen;
      }
    }

    previous = byKey(resultA);
  }

  assert.equal(sawOnscreen, true);
  assert.equal(sawOffscreen, true);
});

test('arrows point toward the actual projection on all four edges', () => {
  const camera = makeCamera();
  const units = [
    makeUnit('left', { x: -5000, y: 270 }),
    makeUnit('right', { x: 6000, y: 270 }),
    makeUnit('top', { x: 480, y: -3000 }),
    makeUnit('bottom', { x: 480, y: 4000 }),
  ];

  const markers = byId(
    new UnitMarkerTracker().update(units, camera, 0),
  );

  for (const unit of units) {
    const marker = markers.get(unit.id);
    assert.equal(marker.offscreen, true);
    assertPointsToward(marker, camera.project(unit));
  }

  assert.ok(Math.cos(markers.get('left').angle) < 0);
  assert.ok(Math.cos(markers.get('right').angle) > 0);
  assert.ok(Math.sin(markers.get('top').angle) < 0);
  assert.ok(Math.sin(markers.get('bottom').angle) > 0);
});

test('arrow direction is screen-relative rather than a world-space camera angle', () => {
  const camera = makeCamera({
    x: 0,
    y: 0,

    project(point) {
      return {
        x: this.screenW / 2 - (point.y - this.y) * this.zoom,
        y: this.screenH / 2 + (point.x - this.x) * this.zoom,
      };
    },
  });

  const unit = makeUnit('rotated-projection', { x: 0, y: 5000 });
  const marker = new UnitMarkerTracker().update([unit], camera, 0)[0];

  assert.equal(marker.offscreen, true);
  assertPointsToward(marker, camera.project(unit));
  assert.ok(Math.cos(marker.angle) < -0.99);
});

test('camera pan and zoom preserve tracks and obey the movement limit', () => {
  const tracker = new UnitMarkerTracker();
  const camera = makeCamera();
  const unit = makeUnit('camera-follow', { x: 700, y: 350 });

  const first = tracker.update([unit], camera, 0)[0];

  camera.x += 400;
  const panned = tracker.update([unit], camera, 1 / 60)[0];

  assert.equal(panned.key, first.key);
  assertBounded(first, panned, 1 / 60);
  assert.ok(panned.x < first.x);
  assert.ok(panned.x > camera.project(unit).x);
  assert.ok(panned.alpha > first.alpha);

  camera.zoom = 0.7;
  const zoomed = tracker.update([unit], camera, 1 / 60)[0];

  assert.equal(zoomed.key, first.key);
  assertBounded(panned, zoomed, 1 / 60);
  assert.ok(zoomed.alpha > panned.alpha);
  assertFiniteMarker(zoomed);
});

test('already-offscreen markers travel along their shallow perimeter, including corners', () => {
  const tracker = new UnitMarkerTracker();
  const camera = makeCamera();

  let unit = makeUnit('perimeter-traveler', {
    x: 7000,
    y: 267.5,
  });

  let previous = tracker.update([unit], camera, 0)[0];

  const outer = { left: 20, top: 85, right: 940, bottom: 450 };
  const inner = { left: 32, top: 97, right: 928, bottom: 438 };
  const lane = onBoundary(previous, outer) ? outer : inner;

  assert.equal(onBoundary(previous, lane), true);

  unit = { ...unit, x: -7000 };

  for (let frame = 0; frame < 180; frame += 1) {
    const current = tracker.update([unit], camera, 1 / 60)[0];

    assert.equal(current.offscreen, true);
    assertBounded(previous, current, 1 / 60);
    assert.equal(onBoundary(current, lane), true);
    assertPointsToward(current, camera.project(unit));
    previous = current;
  }

  approximately(previous.x, lane.left);
});

test('dense edges retain every unit, use deterministic key order, and stay shallow', () => {
  const camera = makeCamera();
  const a = new UnitMarkerTracker();
  const b = new UnitMarkerTracker();

  const units = Array.from({ length: 600 }, (_, index) => (
    makeUnit(`crowd-${String(index).padStart(4, '0')}`, {
      x: 20000,
      y: 267.5,
    })
  ));

  const first = a.update(units, camera, 0);
  const reordered = b.update(units.slice().reverse(), camera, 0);

  assert.deepEqual(first, reordered);
  assert.equal(first.length, units.length);
  assert.equal(new Set(first.map(marker => marker.key)).size, units.length);

  for (let index = 0; index < first.length; index += 1) {
    const marker = first[index];

    assertFiniteMarker(marker);
    assert.equal(marker.offscreen, true);

    assert.ok(
      Math.abs(marker.x - 940) <= EPSILON
      || Math.abs(marker.x - 928) <= EPSILON,
    );
    assert.ok(marker.y >= 85 - EPSILON);
    assert.ok(marker.y <= 450 + EPSILON);

    if (index > 0) {
      assert.ok(first[index - 1].key < marker.key);
      assert.ok(first[index - 1].y <= marker.y + EPSILON);
    }
  }

  const old = byKey(first);
  const changedRoster = units
    .filter((_, index) => index % 3 !== 0)
    .concat([
      makeUnit('arrival-before-crowd', { x: 20000, y: 267.5 }),
      makeUnit('z-arrival-after-crowd', { x: 20000, y: 267.5 }),
    ]);

  const next = a.update(changedRoster.reverse(), camera, 1 / 60);
  assert.equal(next.length, changedRoster.length);

  for (const marker of next) {
    const previous = old.get(marker.key);
    if (!previous) continue;

    assertBounded(previous, marker, 1 / 60);
    // Right-edge lane membership does not change when the roster changes.
    approximately(marker.x, previous.x);
  }
});

test('invalid and nonpositive dt freeze animation but still refresh and prune the roster', () => {
  const tracker = new UnitMarkerTracker();
  const camera = makeCamera();
  const original = makeUnit('dt-freeze', { x: 300, y: 340 });

  tracker.update([original], camera, 0);
  const before = tracker.update([original], camera, 1 / 60)[0];
  const moved = { ...original, x: 800, y: 400, level: 8 };

  for (const dt of [0, -0.1, NaN, Infinity, -Infinity, undefined]) {
    const current = tracker.update([moved], camera, dt)[0];

    assert.equal(current.x, before.x);
    assert.equal(current.y, before.y);
    assert.equal(current.alpha, before.alpha);
    assert.equal(current.level, 8);
    assertFiniteMarker(current);
  }

  assert.deepEqual(tracker.update([], camera, NaN), []);

  const returned = tracker.update([moved], camera, 0)[0];
  assert.equal(returned.alpha, 0);
  approximately(returned.x, 800);
  approximately(returned.y, 325);
});

test('large finite dt is equivalent to the documented 50ms cap', () => {
  const camera = makeCamera();

  function preparedTracker() {
    const tracker = new UnitMarkerTracker();
    const unit = makeUnit('capped', { x: 300, y: 340 });
    tracker.update([unit], camera, 0);
    tracker.update([unit], camera, 1 / 60);
    return tracker;
  }

  const a = preparedTracker();
  const b = preparedTracker();
  const target = makeUnit('capped', { x: 850, y: 400 });

  const capped = a.update([target], camera, 0.05);
  const huge = b.update([target], camera, Number.MAX_VALUE);

  assert.deepEqual(huge, capped);
});

test('irregular dt stays finite and obeys the displacement bound through edge changes', () => {
  const tracker = new UnitMarkerTracker();
  const camera = makeCamera();
  const dts = [
    0,
    NaN,
    Infinity,
    -Infinity,
    -0.1,
    1 / 240,
    1 / 60,
    0.035,
    0.3,
    2,
  ];

  let previous = tracker.update([makeUnit('irregular')], camera, 0)[0];

  for (let frame = 0; frame < 80; frame += 1) {
    const dt = dts[frame % dts.length];
    const unit = makeUnit('irregular', {
      x: frame % 2 === 0 ? -4000 : 5000,
      y: frame % 3 === 0 ? -1500 : 2000,
    });

    const current = tracker.update([unit], camera, dt)[0];

    assertFiniteMarker(current);
    assertBounded(previous, current, dt);
    assert.equal(current.key, previous.key);
    assert.ok(current.alpha >= previous.alpha);
    assertPointsToward(current, camera.project(unit));
    previous = current;
  }
});

test('new units fade at their target instead of flying from the origin', () => {
  const tracker = new UnitMarkerTracker();
  const camera = makeCamera();
  const unit = makeUnit('arrival', { x: 620, y: 350 });

  let previous = tracker.update([unit], camera, 10)[0];

  approximately(previous.x, 620);
  approximately(previous.y, 275);
  assert.equal(previous.alpha, 0);

  for (let frame = 0; frame < 120; frame += 1) {
    const current = tracker.update([unit], camera, 1 / 60)[0];

    approximately(current.x, 620);
    approximately(current.y, 275);
    assert.ok(current.alpha >= previous.alpha);
    assert.ok(current.alpha <= 1);
    previous = current;
  }

  assert.ok(previous.alpha > 0.99);
});

test('death, absence, and life changes discard former animation state', () => {
  const tracker = new UnitMarkerTracker();
  const camera = makeCamera();

  const initial = makeUnit('respawn', { x: 300, life: 1 });
  const first = tracker.update([initial], camera, 0)[0];

  for (let frame = 0; frame < 20; frame += 1) {
    tracker.update([initial], camera, 1 / 60);
  }

  assert.deepEqual(
    tracker.update([{ ...initial, hp: 0 }], camera, 1 / 60),
    [],
  );

  const sameLifeReturned = tracker.update(
    [{ ...initial, x: 700 }],
    camera,
    0,
  )[0];

  assert.equal(sameLifeReturned.key, first.key);
  assert.equal(sameLifeReturned.alpha, 0);
  approximately(sameLifeReturned.x, 700);

  tracker.update([{ ...initial, x: 700 }], camera, 1 / 60);

  const newLife = tracker.update(
    [{ ...initial, life: 2, x: 200 }],
    camera,
    0,
  )[0];

  assert.notEqual(newLife.key, first.key);
  assert.equal(newLife.life, 2);
  assert.equal(newLife.alpha, 0);
  approximately(newLife.x, 200);

  assert.deepEqual(tracker.update([], camera, 0), []);

  const afterAbsence = tracker.update(
    [{ ...initial, life: 2, x: 800 }],
    camera,
    0,
  )[0];

  assert.equal(afterAbsence.alpha, 0);
  approximately(afterAbsence.x, 800);
});

test('becoming ineligible prunes a live unit just like leaving the roster', () => {
  const tracker = new UnitMarkerTracker();
  const camera = makeCamera();
  const unit = makeUnit('eligibility-change', { x: 300 });

  tracker.update([unit], camera, 0);
  tracker.update([unit], camera, 1 / 60);

  assert.deepEqual(
    tracker.update([{ ...unit, source: 'system' }], camera, 0),
    [],
  );

  const returned = tracker.update(
    [{ ...unit, x: 700 }],
    camera,
    0,
  )[0];

  assert.equal(returned.alpha, 0);
  approximately(returned.x, 700);
});

test('old identities are not resurrected after many different live rosters', () => {
  const tracker = new UnitMarkerTracker();
  const camera = makeCamera();
  const original = makeUnit('old-identity', { x: 250 });

  tracker.update([original], camera, 0);
  tracker.update([original], camera, 1 / 60);

  for (let index = 0; index < 400; index += 1) {
    const markers = tracker.update(
      [makeUnit(`temporary-${index}`)],
      camera,
      1 / 60,
    );
    assert.equal(markers.length, 1);
  }

  const returned = tracker.update(
    [{ ...original, x: 750 }],
    camera,
    0,
  )[0];

  assert.equal(returned.alpha, 0);
  approximately(returned.x, 750);
});

test('epoch changes and reset discard tracks, while ordinary movement does not', () => {
  const tracker = new UnitMarkerTracker();
  const camera = makeCamera();
  const unit = makeUnit('epoch-unit', { x: 300 });

  tracker.update([unit], camera, 0, { epoch: 7 });
  const warmed = tracker.update([unit], camera, 1 / 60, { epoch: 7 })[0];

  const sameEpoch = tracker.update(
    [{ ...unit, x: 700 }],
    camera,
    0,
    { epoch: 7 },
  )[0];

  assert.equal(sameEpoch.x, warmed.x);
  assert.equal(sameEpoch.alpha, warmed.alpha);

  const changedEpoch = tracker.update(
    [{ ...unit, x: 700 }],
    camera,
    0,
    { epoch: 8 },
  )[0];

  approximately(changedEpoch.x, 700);
  assert.equal(changedEpoch.alpha, 0);

  const returnedEpoch = tracker.update(
    [{ ...unit, x: 200 }],
    camera,
    0,
    { epoch: 7 },
  )[0];

  approximately(returnedEpoch.x, 200);
  assert.equal(returnedEpoch.alpha, 0);

  tracker.update([{ ...unit, x: 200 }], camera, 1 / 60, { epoch: 7 });
  tracker.reset();

  const reset = tracker.update(
    [{ ...unit, x: 800 }],
    camera,
    0,
    { epoch: 7 },
  )[0];

  approximately(reset.x, 800);
  assert.equal(reset.alpha, 0);
});

test('resize preserves position, then converges without an immediate clamp jump', () => {
  const tracker = new UnitMarkerTracker();
  const camera = makeCamera();
  const unit = makeUnit('resize', { x: 10000, y: 270 });

  const first = tracker.update([unit], camera, 0)[0];
  const warmed = tracker.update([unit], camera, 1 / 60)[0];

  camera.screenW = 200;
  camera.screenH = 160;

  let previous = tracker.update([unit], camera, 0)[0];

  assert.equal(previous.key, first.key);
  assert.equal(previous.x, warmed.x);
  assert.equal(previous.y, warmed.y);
  assert.equal(previous.alpha, warmed.alpha);

  for (let frame = 0; frame < 300; frame += 1) {
    const current = tracker.update([unit], camera, 1 / 60)[0];

    assertFiniteMarker(current);
    assertBounded(previous, current, 1 / 60);
    previous = current;
  }

  assert.ok(previous.x >= 0 && previous.x <= camera.screenW);
  assert.ok(previous.y >= 0 && previous.y <= camera.screenH);
  assert.equal(previous.offscreen, true);
});

test('tiny positive viewports retain every unit with finite positions', () => {
  for (const [screenW, screenH] of [
    [1, 1],
    [30, 40],
    [100, 120],
  ]) {
    const camera = makeCamera({
      screenW,
      screenH,
      x: 0,
      y: 0,
    });

    const units = [
      makeUnit('left', { x: -10000, y: 0 }),
      makeUnit('right', { x: 10000, y: 0 }),
      makeUnit('top', { x: 0, y: -10000 }),
      makeUnit('bottom', { x: 0, y: 10000 }),
    ];

    const markers = new UnitMarkerTracker().update(units, camera, 0);

    assert.equal(markers.length, units.length);

    for (const marker of markers) {
      assertFiniteMarker(marker);
      assert.equal(marker.offscreen, true);
      assert.ok(marker.x >= -EPSILON);
      assert.ok(marker.x <= screenW + EPSILON);
      assert.ok(marker.y >= -EPSILON);
      assert.ok(marker.y <= screenH + EPSILON);
    }
  }
});

test('independent callers do not share tracks, epochs, or reset state', () => {
  const active = new UnitMarkerTracker();
  const other = new UnitMarkerTracker();
  const control = new UnitMarkerTracker();
  const camera = makeCamera();

  const initial = [makeUnit('same-id', { x: 300 })];

  active.update(initial, camera, 0);
  other.update(initial, camera, 0);
  control.update(initial, camera, 0);

  for (let frame = 0; frame < 40; frame += 1) {
    active.update(
      [makeUnit('same-id', {
        x: frame % 2 === 0 ? 5000 : -5000,
        life: frame + 10,
      })],
      camera,
      0.05,
      { epoch: frame },
    );

    if (frame % 3 === 0) active.reset();

    const units = [
      makeUnit('same-id', { x: 300 + frame * 2 }),
    ];

    assert.deepEqual(
      other.update(units, camera, 1 / 60),
      control.update(units, camera, 1 / 60),
    );
  }
});

test('duplicate identities and invalid projections fail without committing partial state', () => {
  const tracker = new UnitMarkerTracker();
  const camera = makeCamera();
  const unit = makeUnit('retained', { x: 300 });

  const first = tracker.update([unit], camera, 0)[0];

  assert.throws(
    () => tracker.update([unit, { ...unit }], camera, 0.05, { epoch: 99 }),
    /Duplicate live unit identity/,
  );

  const invalidProjection = makeCamera({
    project() {
      return { x: NaN, y: 100 };
    },
  });

  assert.throws(
    () => tracker.update([unit], invalidProjection, 0.05, { epoch: 99 }),
    /project\(\) must return finite x\/y/,
  );

  const retained = tracker.update(
    [{ ...unit, x: 700 }],
    camera,
    0,
  )[0];

  assert.equal(retained.key, first.key);
  assert.equal(retained.x, first.x);
  assert.equal(retained.y, first.y);
  assert.equal(retained.alpha, first.alpha);
});

test('invalid camera geometry and malformed eligible unit identities are rejected explicitly', () => {
  const tracker = new UnitMarkerTracker();
  const unit = makeUnit('valid');

  for (const overrides of [
    { screenW: 0 },
    { screenH: -1 },
    { screenW: Infinity },
    { screenH: NaN },
    { zoom: 0 },
    { zoom: Infinity },
    { project: null },
  ]) {
    assert.throws(
      () => tracker.update([unit], makeCamera(overrides), 0),
      TypeError,
    );
  }

  assert.throws(
    () => tracker.update(null, makeCamera(), 0),
    /units must be an array/,
  );

  assert.throws(
    () => tracker.update(
      [makeUnit(undefined)],
      makeCamera(),
      0,
    ),
    /unit\.id and life/,
  );

  assert.throws(
    () => tracker.update(
      [makeUnit('bad-life', { life: NaN })],
      makeCamera(),
      0,
    ),
    /unit\.id and life/,
  );

  assert.throws(
    () => tracker.update(
      [makeUnit('bad-scale', { scale: -1 })],
      makeCamera(),
      0,
    ),
    /scale must be positive and finite/,
  );
});
