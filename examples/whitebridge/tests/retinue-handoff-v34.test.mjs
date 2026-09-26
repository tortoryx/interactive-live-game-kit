import test from 'node:test';
import assert from 'node:assert/strict';
import {PixelWorld} from '../modules/pixel-war/world.mjs';
import {
  prepareRetinue, deployRetinues, applyLegacy, updateLegacies,
} from '../modules/pixel-war/legacy.mjs';
import {
  allowNpc, crowdScale, enableAudienceBattle, playerTroop, populationLimit,
} from '../modules/pixel-war/audience-battle.mjs';
import {beginSettlement, advanceSettlement} from '../modules/pixel-war/settlement.mjs';
import {enrollTroop, TROOP_BATTLES} from '../modules/pixel-war/service-life.mjs';
import {legacyPackage} from '../modules/pixel-war/public/legacy-catalog.mjs';
import {UNITS, BUDGET} from '../modules/pixel-war/public/catalog.mjs';

const SIDES = ['demon', 'human'];
const entourage = (w, side) => w.units.filter(u => u.source === 'retinue' && u.side === side);
const waiting = (w, side) => w.legacyReserve[side];
const position = u => ({x: u.x, y: u.y});
const visible = u => structuredClone(Object.fromEntries([
  'id', 'kind', 'name', 'equipment', 'legacy', 'hp', 'maxHP', 'armor', 'attack',
  'speed', 'range', 'interval', 'shots', 'level', 'xp', 'scale', 'machine',
  'crit', 'armorPen', 'minRange', 'splash',
].map(key => [key, u[key]])));

function world(audience = true) {
  const w = new PixelWorld(37, {audienceDriven: audience});
  w.units = []; w.wildlife = []; w.events = []; w.missiles = []; w.hazards = [];
  w.legacyReserve = {demon: [], human: []}; w.legacyBuildings = [];
  w.deployed = {demon: [], human: []}; w.mode = 'test_live';
  // Deterministic geometry only; fighter, progression, settlement and spawn are real.
  w.ground = p => ({x: p.x, y: p.y});
  w.open = () => true;
  return w;
}

function rank(w, side, value, move = 0) {
  const old = w.heroes[side];
  w.ranks[side] = value;
  w.heroes[side] = Object.assign(w.makeHero(side, value), {
    x: old.x + (side === 'demon' ? -move : move), y: old.y,
  });
}

function stage(w, side, value) {
  rank(w, side, value);
  w.mode = 'settlement'; w.result = {retinues: []};
  prepareRetinue(w, w.result, side);
  return w.result.retinues.find(entry => entry.side === side);
}

function drain(w) {
  w.mode = 'test_live';
  for (let n = 0; n < 16 && SIDES.some(s => waiting(w, s).length); n++) {
    deployRetinues(w);
  }
  for (const side of SIDES) assert.equal(waiting(w, side).length, 0);
}

function advanceUntil(w, predicate) {
  for (let n = 0; n < 2000 && !predicate(); n++) w.step(50);
  assert.ok(predicate(), 'ceremony did not reach its expected boundary');
}

function addPlayer(w, side = 'human') {
  const h = w.heroes[side];
  const u = w.fighter(side, 'militia', UNITS.militia, h.x, h.y + 1000);
  Object.assign(u, {
    source: 'test', receipt: 'player-receipt-' + u.id,
    supporter: {id: 'player-' + u.id, name: 'Player', platform: 'test'},
  });
  enrollTroop(w, u); w.units.push(u);
  return u;
}

// This models full world-field persistence, NOT PixelWorld.snapshot(), which is
// a public render DTO and omits legacyReserve. No production save adapter was supplied.
function roundTrip(w) {
  const fields = [
    'time', 'serial', 'seed', 'mode', 'ranks', 'heroes', 'audienceBattle',
    'legacyReserve', 'legacyBuildings', 'units', 'deployed', 'result',
    'leaderDeaths', 'events', 'missiles', 'hazards', 'barracks', 'wildlife',
  ];
  const saved = JSON.parse(JSON.stringify(Object.fromEntries(fields.map(k => [k, w[k]]))));
  return Object.assign(world(Boolean(w.audienceBattle)), saved);
}

test('the demonstrated giant enters as the same actor only after the real ceremony', () => {
  const w = world();
  rank(w, 'demon', 5);
  const winner = w.heroes.human;
  winner.hp -= 137;
  const woundedHP = winner.hp;
  w.heroes.demon.hp = 0;
  beginSettlement(w, ['demon']);
  advanceUntil(w, () => w.result.handedOff);

  const entry = w.result.retinues.find(r => r.side === 'demon');
  assert.equal(entry.units.length, 1);
  const giant = entry.units[0], appearance = visible(giant), at = position(giant);
  assert.equal(giant.kind, 'colossus');
  assert.equal(giant.legacy.rank, 6);
  assert.deepEqual(giant.equipment, UNITS.colossus.equipment);
  assert.strictEqual(waiting(w, 'demon')[0], giant);
  assert.equal(playerTroop(giant), false);
  assert.equal(giant.supporter.name, w.heroes.demon.name + '随军');
  assert.equal(giant.supporter.platform, 'system');
  assert.equal(giant.supporter.id, undefined);
  assert.equal(giant.receipt, undefined);
  assert.equal(giant.service, undefined);

  const before = structuredClone(giant);
  assert.strictEqual(applyLegacy(w, giant, entry.package), giant);
  assert.deepEqual(giant, before);
  deployRetinues(w);
  assert.equal(entourage(w, 'demon').length, 0);

  advanceUntil(w, () => w.mode !== 'settlement');
  updateLegacies(w);
  assert.strictEqual(entourage(w, 'demon')[0], giant);
  assert.strictEqual(w.result.retinues[0].units[0], giant);
  assert.deepEqual(visible(giant), appearance);
  assert.deepEqual(position(giant), at);
  assert.equal(giant.pop, 0);
  assert.equal(giant.cost, UNITS.colossus.cost);
  assert.strictEqual(w.heroes.human, winner);
  assert.equal(winner.hp, woundedHP);
  for (let n = 0; n < 5; n++) updateLegacies(w);
  assert.equal(entourage(w, 'demon').length, 1);
  assert.equal(w.events.filter(e => e.type === 'summon' && e.target === giant.id).length, 1);
});

test('mobile, armored and veteran demonstration stats are not regenerated on deployment', () => {
  for (const value of [14, 22, 30]) {
    const w = world(), entry = stage(w, 'demon', value);
    const u = entry.units[0], before = visible(u);
    drain(w);
    assert.strictEqual(entourage(w, 'demon')[0], u);
    assert.deepEqual(visible(u), before);
    assert.equal(u.legacy.doctrine, entry.package.doctrine);
    assert.equal(u.level, entry.package.level);
  }
});

test('both sides stay bounded over 64 successor grants, without reissuing a rank', () => {
  const w = world(), issued = new Set();
  for (let value = 1; value <= 64; value++) {
    w.mode = 'settlement'; w.result = {retinues: []};
    for (const side of SIDES) {
      rank(w, side, value, 500); // Fresh local space; test admission/retirement, not crowding.
      prepareRetinue(w, w.result, side);
      const entry = w.result.retinues.find(r => r.side === side);
      assert.equal(entry.units.length, legacyPackage(side, value).count);
      for (const u of entry.units) {
        assert.equal(issued.has(u.id), false); issued.add(u.id);
        assert.ok(waiting(w, side).includes(u));
      }
      const serial = w.serial;
      prepareRetinue(w, w.result, side);
      prepareRetinue(w, {retinues: []}, side);
      assert.equal(w.serial, serial);
      assert.ok(entourage(w, side).length + waiting(w, side).length <= 16);
    }
    drain(w);
    for (const side of SIDES) {
      const units = entourage(w, side);
      assert.ok(units.length <= 16);
      assert.equal(new Set(units.map(u => u.id)).size, units.length);
      assert.ok(units.every(u => u.legacy.rank >= value - 1 && u.legacy.rank <= value));
      assert.ok(new Set(units.map(u => u.legacy.rank)).size <= 2);
      assert.ok(w.legacyReserve.handoffs[side].cohorts.length <= 2);
      assert.deepEqual(w.legacyReserve.handoffs[side].retiring, []);
    }
  }
  w.units = []; // Death/removal of every actor is not permission to grant the rank again.
  for (const side of SIDES) prepareRetinue(w, {retinues: []}, side);
  deployRetinues(w);
  assert.equal(w.units.length, 0);
});

test('blocked cohorts pin the two admission slots instead of being lost at later handoffs', () => {
  const w = world();
  w.open = () => false;
  const giant = stage(w, 'demon', 6).units[0];
  w.mode = 'test_live'; deployRetinues(w);
  const battery = stage(w, 'demon', 7).units[0];
  const ids = [giant.id, battery.id];
  for (let value = 8; value <= 30; value++) {
    assert.equal(stage(w, 'demon', value), undefined);
    deployRetinues(w); // Even direct calls must not deploy during settlement.
    w.mode = 'test_live'; deployRetinues(w);
    assert.deepEqual(waiting(w, 'demon').map(u => u.id), ids);
    assert.equal(entourage(w, 'demon').length, 0);
  }
  w.open = () => true;
  drain(w);
  assert.strictEqual(w.units.find(u => u.id === giant.id), giant);
  assert.strictEqual(w.units.find(u => u.id === battery.id), battery);
  assert.equal(w.legacyReserve.handoffs.demon.seenRank, 30);
  prepareRetinue(w, {retinues: []}, 'demon'); // A previously skipped rank stays skipped.
  assert.equal(waiting(w, 'demon').length, 0);
});

for (const obstruction of ['terrain', 'actor', 'hazard']) {
  test(`${obstruction} blockage keeps the demonstrated actor queued until placement is safe`, () => {
    const w = world();
    if (obstruction === 'terrain') {
      w.open = () => false;
      w.ground = () => null; // Exercise fighter's otherwise-distant camp fallback.
    }
    const giant = stage(w, 'demon', 6).units[0], at = position(giant);
    assert.deepEqual(at, {x: w.heroes.demon.x - 95, y: w.heroes.demon.y + 85});
    let blocker, before;
    if (obstruction === 'actor') {
      blocker = addPlayer(w);
      Object.assign(blocker, at, {radius: 200});
      before = structuredClone(blocker);
    }
    if (obstruction === 'hazard') {
      w.hazards.push({...at, radius: 200, until: w.time + 10000});
    }
    w.mode = 'test_live'; deployRetinues(w);
    assert.strictEqual(waiting(w, 'demon')[0], giant);
    assert.equal(entourage(w, 'demon').length, 0);
    if (blocker) assert.deepEqual(blocker, before);

    w.open = () => true; w.hazards = [];
    if (blocker) blocker.y += 1000;
    deployRetinues(w);
    assert.strictEqual(entourage(w, 'demon')[0], giant);
    assert.deepEqual(position(giant), at);
  });
}

test('a blocked queue head does not prevent a later safe actor from arriving', () => {
  const w = world(), giant = stage(w, 'demon', 6).units[0];
  w.heroes.demon.x -= 500;
  const battery = stage(w, 'demon', 7).units[0];
  w.open = (x, y) => Math.hypot(x - giant.x, y - giant.y) > 200;
  w.mode = 'test_live'; deployRetinues(w);
  assert.deepEqual(waiting(w, 'demon').map(u => u.id), [giant.id]);
  assert.strictEqual(w.units.find(u => u.id === battery.id), battery);
  w.open = () => true;
  deployRetinues(w);
  assert.strictEqual(w.units.find(u => u.id === giant.id), giant);
});

test('a local fallback is collision checked and cannot jump to camp', () => {
  const w = world(), giant = stage(w, 'demon', 6).units[0], at = position(giant);
  const blocker = addPlayer(w, 'demon');
  Object.assign(blocker, at);
  w.mode = 'test_live'; deployRetinues(w);
  assert.strictEqual(entourage(w, 'demon')[0], giant);
  const moved = Math.hypot(giant.x - at.x, giant.y - at.y);
  assert.ok(moved > 0 && moved <= 96 + 1e-9);
  for (const other of w.allAlive().filter(u => u.id !== giant.id)) {
    assert.ok(Math.hypot(giant.x - other.x, giant.y - other.y) >= giant.radius + other.radius + 9);
  }
});

test('queued and deployed IDs survive JSON restore, including replayed copies and removed actors', () => {
  let w = world();
  const shown = stage(w, 'demon', 6).units[0], id = shown.id, appearance = visible(shown);
  w = roundTrip(w);
  assert.notStrictEqual(waiting(w, 'demon')[0], w.result.retinues[0].units[0]);
  deployRetinues(w);
  assert.equal(entourage(w, 'demon').length, 0);
  drain(w);
  const actor = entourage(w, 'demon')[0];
  assert.equal(actor.id, id);
  assert.deepEqual(visible(actor), appearance);
  assert.strictEqual(w.result.retinues[0].units[0], actor);

  w = roundTrip(w);
  const replay = structuredClone(w.result.retinues[0].units[0]);
  enableAudienceBattle(w); // Version-2 re-enabling must not erase the entourage.
  for (let n = 0; n < 3; n++) {
    waiting(w, 'demon').push(structuredClone(replay));
    prepareRetinue(w, {retinues: []}, 'demon');
    deployRetinues(w);
  }
  assert.equal(entourage(w, 'demon').length, 1);
  assert.strictEqual(w.result.retinues[0].units[0], entourage(w, 'demon')[0]);
  assert.deepEqual(w.legacyReserve.handoffs.demon.cohorts[0].deployed, [id]);
  assert.equal(w.events.filter(e => e.type === 'summon' && e.target === id).length, 1);

  w.units = w.units.filter(u => u.id !== id);
  w = roundTrip(w);
  waiting(w, 'demon').push(replay);
  deployRetinues(w);
  prepareRetinue(w, {retinues: []}, 'demon');
  assert.equal(entourage(w, 'demon').length, 0);
  assert.equal(waiting(w, 'demon').length, 0);
});

test('audience entourage consumes neither player population nor the deployment budget', () => {
  const w = world(), player = addPlayer(w, 'demon');
  player.pop = populationLimit(w); // Saturated player admission, far from the arrival site.
  const before = structuredClone(player), pop = w.population('demon');
  w.deployed.demon = [{at: w.time, cost: BUDGET}];
  const budget = structuredClone(w.deployed);
  const giant = stage(w, 'demon', 6).units[0];
  drain(w);
  assert.strictEqual(w.units.find(u => u.id === player.id), player);
  assert.deepEqual(player, before);
  assert.equal(w.population('demon'), pop);
  assert.deepEqual(w.deployed, budget);
  assert.equal(giant.pop, 0);
  assert.equal(playerTroop(giant), false);
});

test('player service still ends at three total leader deaths, including simultaneous deaths', () => {
  const w = world(), player = addPlayer(w);
  assert.equal(TROOP_BATTLES, 3);
  const service = structuredClone(player.service);
  assert.equal(service.expiresAtDeath, 3);
  w.heroes.demon.hp = 0;
  beginSettlement(w, ['demon']);
  assert.equal(w.leaderDeaths, 1);
  assert.ok(w.units.includes(player));
  advanceUntil(w, () => w.mode !== 'settlement');
  deployRetinues(w);
  assert.deepEqual(player.service, service);
  assert.ok(w.units.includes(player));

  w.heroes.demon.hp = 0; w.heroes.human.hp = 0;
  beginSettlement(w, ['demon', 'human']);
  assert.equal(w.leaderDeaths, 3);
  assert.equal(w.units.includes(player), false);
  assert.deepEqual(player.service, service);
});

test('a failed two-sided handoff rolls back bookkeeping without retiring world actors', () => {
  const w = world();
  for (const value of [4, 5]) { stage(w, 'demon', value); drain(w); }
  rank(w, 'human', 5);
  w.heroes.demon.hp = 0; w.heroes.human.hp = 0;
  beginSettlement(w, ['demon', 'human']);
  const ids = w.units.map(u => u.id), reserve = structuredClone(w.legacyReserve);
  const fighter = w.fighter;
  w.fighter = function(side, kind, ...args) {
    if (side === 'human' && kind !== 'hero') throw new Error('injected preparation failure');
    return fighter.call(this, side, kind, ...args);
  };
  w.time = w.result.startedAt + w.result.timing.handoff;
  assert.throws(() => advanceSettlement(w, 50), /injected preparation failure/);
  assert.deepEqual(w.units.map(u => u.id), ids);
  assert.deepEqual(w.legacyReserve, reserve);
  assert.equal(w.result.handedOff, false);
  assert.equal(w.events.some(e => e.type === 'retire' && e.source === 'retinue'), false);
});

test('non-audience retinues still obey population, cost and the two-per-call batch limit', () => {
  const w = world(false), giant = stage(w, 'demon', 6).units[0];
  assert.equal(giant.pop, UNITS.colossus.pop);
  w.mode = 'test_live';
  w.deployed.demon = [{at: w.time, cost: BUDGET}];
  deployRetinues(w);
  assert.strictEqual(waiting(w, 'demon')[0], giant);
  w.deployed.demon = [];
  const player = addPlayer(w, 'demon');
  player.pop = populationLimit(w);
  deployRetinues(w);
  assert.strictEqual(waiting(w, 'demon')[0], giant);
  w.units = w.units.filter(u => u.id !== player.id);
  deployRetinues(w);
  assert.strictEqual(entourage(w, 'demon')[0], giant);
  assert.deepEqual(w.deployed.demon, [{at: w.time, cost: giant.cost}]);
  const scouts = stage(w, 'demon', 8).units;
  w.mode = 'test_live'; deployRetinues(w);
  assert.equal(scouts.filter(u => w.units.includes(u)).length, 2);
  assert.equal(waiting(w, 'demon').length, 3);
});

test('the entourage exception does not reopen ambient waves or admit unissued NPCs', () => {
  const w = world(), giant = stage(w, 'demon', 6).units[0];
  drain(w);
  const rogue = w.fighter('demon', 'militia', UNITS.militia, giant.x - 500, giant.y);
  Object.assign(rogue, {source: 'retinue', supporter: {name: 'Unissued', platform: 'system'}});
  waiting(w, 'demon').push(rogue);
  deployRetinues(w);
  assert.equal(w.units.includes(rogue), false);
  for (const participants of [0, 100, 1000]) {
    assert.equal(crowdScale(participants).waveSize, 0);
    assert.equal(crowdScale(participants).systemCap, 0);
  }
  for (const side of SIDES) {
    assert.equal(allowNpc(w, side), false);
    for (const kind of ['militia', 'colossus', 'dreadnought']) {
      assert.equal(w.spawn(side, kind), false);
    }
  }
  w.nextSpawn = w.nextGiant = w.nextWildlife = w.nextHazard = w.time;
  w.step(50);
  assert.ok(w.units.some(u => u.id === giant.id));
  assert.equal(w.units.some(u => !playerTroop(u) && u.source !== 'retinue'), false);
  assert.equal(w.units.includes(rogue), false);
  assert.equal(w.wildlife.length, 0);
  // Leaders retain their deliberate skills; only ownerless automatic hazards are forbidden.
  assert.equal(w.hazards.filter(h => !h.sourceId).length, 0);
});
