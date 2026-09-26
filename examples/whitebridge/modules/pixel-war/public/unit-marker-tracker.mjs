const ALLOWED_SOURCES = new Set([
  'test',
  'bilibili',
  'xiaohongshu',
]);

// Screen-space motion limits. Long updates deliberately do not catch up in
// one jump. Non-finite, negative, and zero dt do not advance animation.
const MAX_DT = 0.05;
const MAX_SPEED = 900;
const FOLLOW_RATE = 16;
const FADE_RATE = 10;
const FINISH_DISTANCE = 0.001;

// Center clearance above the supplied bodyBox's top.
const HEAD_CLEARANCE = 12;

// Only two shallow lanes are used. Lane membership depends on the unit key,
// never on its owner, array position, or the size of the current roster.
const LANE_DEPTH = 12;
const PREFERRED_SPACING = 24;
const EDGE_HYSTERESIS = 24;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function isKeyPart(value) {
  return (
    typeof value === 'string'
    || (typeof value === 'number' && Number.isFinite(value))
  );
}

function hasOwnerId(value) {
  return isKeyPart(value) && value !== '';
}

function eligible(unit) {
  return Boolean(
    unit
    && unit.hp > 0
    && unit.kind !== 'hero'
    && ALLOWED_SOURCES.has(unit.source)
    && hasOwnerId(unit.supporter?.id)
  );
}

function unitKey(id, life) {
  if (!isKeyPart(id) || !isKeyPart(life)) {
    throw new TypeError(
      'UnitMarkerTracker: unit.id and life must be strings or finite numbers',
    );
  }

  // A serialized tuple avoids delimiter collisions and distinguishes, for
  // example, numeric ID 7 from string ID "7".
  return JSON.stringify([id, life]);
}

function animationSeconds(dt) {
  return Number.isFinite(dt) && dt > 0 ? Math.min(dt, MAX_DT) : 0;
}

function makeRect(left, top, right, bottom) {
  const width = right - left;
  const height = bottom - top;

  return {
    left,
    top,
    right,
    bottom,
    width,
    height,
    perimeter: 2 * (width + height),
  };
}

function usefulRect(camera) {
  if (
    !camera
    || typeof camera.project !== 'function'
    || !Number.isFinite(camera.screenW)
    || !Number.isFinite(camera.screenH)
    || !Number.isFinite(camera.zoom)
    || camera.screenW <= 0
    || camera.screenH <= 0
    || camera.zoom <= 0
  ) {
    throw new TypeError(
      'UnitMarkerTracker: camera needs positive finite screenW, screenH, '
      + 'and zoom, plus project()',
    );
  }

  // Preserve useful space even in very small viewports.
  const side = Math.min(20, camera.screenW / 4);
  const verticalScale = Math.min(1, camera.screenH / 350);

  const rect = makeRect(
    side,
    85 * verticalScale,
    camera.screenW - side,
    camera.screenH - 90 * verticalScale,
  );

  if (
    rect.width <= 0
    || rect.height <= 0
    || !Number.isFinite(rect.perimeter)
  ) {
    throw new RangeError(
      'UnitMarkerTracker: camera dimensions cannot be represented safely',
    );
  }

  return rect;
}

function insetRect(rect, inset) {
  return makeRect(
    rect.left + inset,
    rect.top + inset,
    rect.right - inset,
    rect.bottom - inset,
  );
}

function outside(point, rect) {
  return (
    point.x < rect.left
    || point.x > rect.right
    || point.y < rect.top
    || point.y > rect.bottom
  );
}

function clampPoint(point, rect) {
  return {
    x: clamp(point.x, rect.left, rect.right),
    y: clamp(point.y, rect.top, rect.bottom),
  };
}

function laneFor(key) {
  let hash = 2166136261;

  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  }

  return hash & 1;
}

// Edges and their coordinates run clockwise:
// 0: top, left to right
// 1: right, top to bottom
// 2: bottom, right to left
// 3: left, bottom to top
function edgeLength(rect, edge) {
  return edge % 2 === 0 ? rect.width : rect.height;
}

function edgeStart(rect, edge) {
  switch (edge) {
    case 0:
      return 0;
    case 1:
      return rect.width;
    case 2:
      return rect.width + rect.height;
    default:
      return 2 * rect.width + rect.height;
  }
}

function edgeAim(point, rect, previousEdge) {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = point.x - centerX;
  const dy = point.y - centerY;

  const tx = dx === 0 ? Infinity : (rect.width / 2) / Math.abs(dx);
  const ty = dy === 0 ? Infinity : (rect.height / 2) / Math.abs(dy);

  let edge;
  let along;

  if (tx <= ty) {
    const y = clamp(centerY + dy * tx, rect.top, rect.bottom);
    edge = dx > 0 ? 1 : 3;
    along = edge === 1 ? y - rect.top : rect.bottom - y;
  } else {
    const x = clamp(centerX + dx * ty, rect.left, rect.right);
    edge = dy < 0 ? 0 : 2;
    along = edge === 0 ? x - rect.left : rect.right - x;
  }

  // Retain the previous edge near a shared corner. This avoids repeatedly
  // changing edge membership when a projection jitters across a corner ray.
  if (
    previousEdge >= 0
    && previousEdge < 4
    && previousEdge !== edge
  ) {
    const threshold = Math.min(
      EDGE_HYSTERESIS,
      edgeLength(rect, edge) / 4,
      edgeLength(rect, previousEdge) / 4,
    );

    if (
      edge === (previousEdge + 1) % 4
      && along <= threshold
    ) {
      return {
        edge: previousEdge,
        along: edgeLength(rect, previousEdge),
      };
    }

    if (
      edge === (previousEdge + 3) % 4
      && edgeLength(rect, edge) - along <= threshold
    ) {
      return { edge: previousEdge, along: 0 };
    }
  }

  return { edge, along };
}

function wrap(value, length) {
  return ((value % length) + length) % length;
}

function perimeterPoint(rect, position) {
  let remaining = wrap(position, rect.perimeter);

  if (remaining <= rect.width) {
    return { x: rect.left + remaining, y: rect.top };
  }

  remaining -= rect.width;
  if (remaining <= rect.height) {
    return { x: rect.right, y: rect.top + remaining };
  }

  remaining -= rect.height;
  if (remaining <= rect.width) {
    return { x: rect.right - remaining, y: rect.bottom };
  }

  remaining -= rect.width;
  return { x: rect.left, y: rect.bottom - remaining };
}

function nearestBoundary(point, rect) {
  const x = clamp(point.x, rect.left, rect.right);
  const y = clamp(point.y, rect.top, rect.bottom);

  const candidates = [
    {
      x,
      y: rect.top,
      position: x - rect.left,
    },
    {
      x: rect.right,
      y,
      position: rect.width + y - rect.top,
    },
    {
      x,
      y: rect.bottom,
      position: rect.width + rect.height + rect.right - x,
    },
    {
      x: rect.left,
      y,
      position: 2 * rect.width + rect.height + rect.bottom - y,
    },
  ];

  let best = null;

  for (const candidate of candidates) {
    const distance = Math.hypot(
      candidate.x - point.x,
      candidate.y - point.y,
    );

    if (best === null || distance < best.distance) {
      best = { ...candidate, distance };
    }
  }

  return best;
}

function travelDistance(distance, seconds) {
  if (distance === 0 || seconds === 0) return 0;

  const budget = MAX_SPEED * seconds;

  // Finish tiny residuals without ever exceeding the speed budget.
  if (distance <= FINISH_DISTANCE) {
    return Math.min(distance, budget);
  }

  return Math.min(
    budget,
    distance * -Math.expm1(-FOLLOW_RATE * seconds),
  );
}

function followPoint(previous, target, seconds) {
  const dx = target.x - previous.x;
  const dy = target.y - previous.y;
  const distance = Math.hypot(dx, dy);

  if (distance === 0 || seconds === 0) {
    return { x: previous.x, y: previous.y };
  }

  const fraction = travelDistance(distance, seconds) / distance;

  return {
    x: previous.x + dx * fraction,
    y: previous.y + dy * fraction,
  };
}

function followPerimeter(previous, targetPosition, rect, seconds) {
  if (seconds === 0) {
    return { x: previous.x, y: previous.y };
  }

  const nearest = nearestBoundary(previous, rect);
  let delta = wrap(
    targetPosition - nearest.position,
    rect.perimeter,
  );

  // An exact half-perimeter tie consistently chooses clockwise.
  if (delta > rect.perimeter / 2) {
    delta -= rect.perimeter;
  }

  const arcDistance = Math.abs(delta);
  const pathDistance = nearest.distance + arcDistance;

  if (pathDistance === 0) {
    return { x: previous.x, y: previous.y };
  }

  const travel = travelDistance(pathDistance, seconds);

  // On entry, or after resize, first attach to the nearest boundary.
  // Once attached, movement follows the perimeter rather than cutting a
  // chord across the battlefield when the desired edge changes.
  if (travel < nearest.distance) {
    const fraction = travel / nearest.distance;

    return {
      x: previous.x + (nearest.x - previous.x) * fraction,
      y: previous.y + (nearest.y - previous.y) * fraction,
    };
  }

  const arcTravel = Math.min(
    arcDistance,
    Math.max(0, travel - nearest.distance),
  );

  return perimeterPoint(
    rect,
    nearest.position + Math.sign(delta) * arcTravel,
  );
}

function assignEdgeTargets(records, outer) {
  const depth = Math.min(
    LANE_DEPTH,
    outer.width / 4,
    outer.height / 4,
  );

  const laneRects = [outer, insetRect(outer, depth)];
  const groups = [[], [], [], []];

  // records are already sorted by stable key. Each edge therefore receives
  // a deterministic key order, independent of input order.
  for (const record of records) {
    if (!record.offscreen) continue;

    const aim = edgeAim(record.projected, outer, record.edge);
    record.edge = aim.edge;
    record.natural = aim.along;
    record.lane = laneFor(record.key);
    record.edgeRect = laneRects[record.lane];

    groups[record.edge].push(record);
  }

  for (let edge = 0; edge < groups.length; edge += 1) {
    const items = groups[edge];
    if (items.length === 0) continue;

    // A common tangential range fits both lanes, including at corners.
    const low = depth;
    const high = edgeLength(outer, edge) - depth;
    const spacing = items.length === 1
      ? 0
      : Math.min(
        PREFERRED_SPACING,
        (high - low) / (items.length - 1),
      );

    const maxStart = Math.max(
      low,
      high - spacing * (items.length - 1),
    );

    // Bounded isotonic regression:
    //   target[i + 1] >= target[i] + spacing
    //
    // Subtracting i * spacing turns that into an ordinary nondecreasing
    // sequence. Pool-adjacent-violators finds positions closest to the
    // projected aims without swapping stable-key slot order.
    const blocks = [];

    for (let index = 0; index < items.length; index += 1) {
      blocks.push({
        start: index,
        end: index + 1,
        count: 1,
        mean: clamp(items[index].natural, low, high) - index * spacing,
      });

      while (
        blocks.length >= 2
        && blocks[blocks.length - 2].mean > blocks[blocks.length - 1].mean
      ) {
        const right = blocks.pop();
        const left = blocks.pop();
        const count = left.count + right.count;

        blocks.push({
          start: left.start,
          end: right.end,
          count,
          mean: left.mean
            + (right.mean - left.mean) * (right.count / count),
        });
      }
    }

    for (const block of blocks) {
      const start = clamp(block.mean, low, maxStart);

      for (let index = block.start; index < block.end; index += 1) {
        const record = items[index];
        const along = clamp(start + index * spacing, low, high);
        const inset = record.lane * depth;

        record.targetPosition = (
          edgeStart(record.edgeRect, edge) + along - inset
        );
        record.target = perimeterPoint(
          record.edgeRect,
          record.targetPosition,
        );
      }
    }
  }
}

/**
 * Pure, caller-owned animation state for one marker per live viewer unit.
 *
 * Identity:
 *   - key is JSON.stringify([unit.id, unit.life ?? 0]).
 *   - IDs/lives must be strings or finite numbers.
 *   - Duplicate eligible id/life pairs are rejected, not silently discarded.
 *
 * Geometry:
 *   - Uses camera.project() in CSS screen coordinates.
 *   - Non-hero body heights match the supplied bodyBox implementation.
 *   - Onscreen head anchors are clamped into the useful HUD rectangle.
 *   - Offscreen classification uses the projected unit, not its head anchor.
 *
 * Animation:
 *   - New identities start at their target with alpha 0.
 *   - Existing identities move at most 900 * min(dt, 0.05) CSS pixels.
 *   - Invalid/nonpositive dt freezes animation but still refreshes the roster.
 *   - Epoch changes and reset() discard all previous identities.
 *   - Resize preserves position and applies the ordinary motion limit.
 *
 * Crowding:
 *   - Every eligible unit is returned.
 *   - Two key-stable lanes extend at most 12 pixels inward.
 *   - Target spacing contracts when an edge is crowded.
 *   - Displayed positions converge gradually to key-ordered edge targets;
 *     arrivals and transitions can temporarily overlap existing markers.
 */
export class UnitMarkerTracker {
  #tracks;
  #epoch;

  constructor() {
    this.#tracks = new Map();
    this.#epoch = undefined;
  }

  reset() {
    this.#tracks = new Map();
    this.#epoch = undefined;
  }

  update(units, camera, dt, { epoch = 0 } = {}) {
    if (!Array.isArray(units)) {
      throw new TypeError('UnitMarkerTracker: units must be an array');
    }

    const outer = usefulRect(camera);
    const seconds = animationSeconds(dt);
    const previousTracks = Object.is(epoch, this.#epoch)
      ? this.#tracks
      : new Map();

    const records = [];
    const seen = new Set();

    // Build and validate the complete frame before committing state.
    for (const unit of units) {
      if (!eligible(unit)) continue;

      const life = unit.life ?? 0;
      const key = unitKey(unit.id, life);

      if (seen.has(key)) {
        throw new TypeError(
          `UnitMarkerTracker: Duplicate live unit identity: ${key}`,
        );
      }
      seen.add(key);

      const result = camera.project(unit);

      if (
        !result
        || !Number.isFinite(result.x)
        || !Number.isFinite(result.y)
      ) {
        throw new TypeError(
          'UnitMarkerTracker: camera.project() must return finite x/y',
        );
      }

      // Snapshot the result: project() is allowed to reuse a scratch object.
      const projected = { x: result.x, y: result.y };
      const scale = unit.scale || 1;

      if (!Number.isFinite(scale) || scale <= 0) {
        throw new TypeError(
          'UnitMarkerTracker: effective unit scale must be positive and finite',
        );
      }

      const height = unit.machine
        ? (unit.kind === 'dreadnought' ? 105 : 62)
        : 60;

      const anchor = {
        x: projected.x,
        y: projected.y
          - height * scale * camera.zoom
          - 3
          - HEAD_CLEARANCE,
      };

      if (!Number.isFinite(anchor.y)) {
        throw new RangeError(
          'UnitMarkerTracker: projected body anchor is not finite',
        );
      }

      const previous = previousTracks.get(key);

      records.push({
        key,
        life,
        unit,
        projected,
        previous,
        edge: previous?.edge ?? -1,
        offscreen: outside(projected, outer),
        target: clampPoint(anchor, outer),
      });
    }

    records.sort((a, b) => (
      a.key < b.key ? -1 : a.key > b.key ? 1 : 0
    ));

    assignEdgeTargets(records, outer);

    const nextTracks = new Map();
    const markers = [];

    for (const record of records) {
      const previous = record.previous;

      const point = !previous
        ? { x: record.target.x, y: record.target.y }
        : record.offscreen
          ? followPerimeter(
            previous,
            record.targetPosition,
            record.edgeRect,
            seconds,
          )
          : followPoint(previous, record.target, seconds);

      const alpha = previous
        ? clamp(
          previous.alpha
            + (1 - previous.alpha) * -Math.expm1(-FADE_RATE * seconds),
          0,
          1,
        )
        : 0;

      nextTracks.set(record.key, {
        x: point.x,
        y: point.y,
        alpha,
        edge: record.edge,
      });

      markers.push({
        key: record.key,
        unitId: record.unit.id,
        life: record.life,
        owner: { ...record.unit.supporter },
        side: record.unit.side,
        factionColor:record.unit.factionColor, factionName:record.unit.factionName, commander:!!record.unit.commander, hp:record.unit.hp, maxHP:record.unit.maxHP,
        kind: record.unit.kind,
        level: record.unit.level ?? 1,
        x: point.x,
        y: point.y,
        offscreen: record.offscreen,
        // Use the emitted center and current screen projection, including
        // during camera motion and edge transitions. Never use world angle
        // or a previous edge's normal as the arrow direction.
        angle: Math.atan2(
          record.projected.y - point.y,
          record.projected.x - point.x,
        ),
        alpha,
      });
    }

    // Only the current eligible roster remains reachable from this tracker.
    this.#tracks = nextTracks;
    this.#epoch = epoch;

    return markers;
  }
}
