import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ViewerHistory } from '../modules/live-runtime/viewer-history.mjs';

const DAY = 86_400_000;
const BASE = 1_700_000_000_000;

const IDENTITY = Object.freeze({
  platform: 'test',
  viewerId: 'viewer-1',
  side: 'demon',
  persona: 'leader-1',
});

function message(overrides = {}) {
  return {
    ...IDENTITY,
    name: 'Viewer',
    eventId: 'event-1',
    messageId: null,
    text: 'hello',
    at: BASE,
    ...overrides,
  };
}

function recallOptions(overrides = {}) {
  return {
    ...IDENTITY,
    text: '',
    now: BASE + 365 * DAY,
    ...overrides,
  };
}

function read(history, overrides = {}) {
  return history.recall(recallOptions(overrides));
}

function add(history, overrides = {}) {
  const entry = message(overrides);
  assert.equal(history.arrived(entry), true);
  return entry;
}

function publish(history, entry, overrides = {}) {
  const reply = {
    eventId: entry.eventId,
    persona: entry.persona,
    text: 'published reply',
    at: entry.at + 1,
    ...overrides,
  };

  assert.equal(history.appendReply(reply), true);
  return reply;
}

function expectedPair(entry, leaderReplied = null, repliedAt = null) {
  return {
    eventId: entry.eventId,
    messageId: entry.messageId,
    viewerSaid: entry.text,
    leaderReplied,
    receivedAt: entry.at,
    repliedAt,
  };
}

function eventIds(pairs) {
  return pairs.map(pair => pair.eventId);
}

function jsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function counts(db) {
  const row = db.prepare(`
    SELECT
      (SELECT count(*) FROM viewer_history_events) AS events,
      (SELECT count(*) FROM viewer_history_replies) AS replies;
  `).get();

  return { events: row.events, replies: row.replies };
}

function memoryDatabase(t, options = {}) {
  const db = new DatabaseSync(':memory:', options);

  t.after(() => {
    if (db.isOpen) db.close();
  });

  return { db, history: new ViewerHistory(db) };
}

test('constructor is idempotent and confines schema objects to its namespace', t => {
  const { db, history } = memoryDatabase(t);

  db.exec(`
    CREATE TABLE unrelated (value INTEGER NOT NULL) STRICT;
    INSERT INTO unrelated (value) VALUES (7);
  `);

  const entry = add(history);
  const reply = publish(history, entry);

  const second = new ViewerHistory(db);

  assert.equal(db.isTransaction, false);
  assert.deepEqual(counts(db), { events: 1, replies: 1 });
  assert.deepEqual(
    read(second),
    [expectedPair(entry, reply.text, reply.at)],
  );
  assert.equal(db.prepare('SELECT value FROM unrelated').get().value, 7);

  const names = db.prepare(`
    SELECT name
    FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%';
  `).all().map(row => row.name);

  assert(names.includes('viewer_history_identity'));
  assert(names.includes('viewer_history_message_id'));

  for (const name of names) {
    assert(
      name === 'unrelated' || name.startsWith('viewer_history_'),
      `unexpected schema object: ${name}`,
    );
  }
});

test('arrival is globally idempotent and never changes an accepted event', t => {
  const { db, history } = memoryDatabase(t);

  const entry = add(history, {
    messageId: 'test:original',
    text: 'original evidence',
  });

  assert.equal(history.arrived(entry), false);

  assert.equal(history.arrived({
    ...entry,
    platform: 'youtube',
    viewerId: 'different-viewer',
    name: 'different name',
    side: 'human',
    persona: 'different-leader',
    messageId: 'youtube:replacement',
    text: 'replacement evidence',
    at: BASE + 100,
  }), false);

  assert.deepEqual(counts(db), { events: 1, replies: 0 });
  assert.deepEqual(read(history), [expectedPair(entry)]);

  assert.deepEqual(read(history, {
    platform: 'youtube',
    viewerId: 'different-viewer',
    side: 'human',
    persona: 'different-leader',
  }), []);

  const stored = db.prepare(`
    SELECT name, message_id
    FROM viewer_history_events
    WHERE event_id = ?;
  `).get(entry.eventId);

  assert.equal(stored.name, entry.name);
  assert.equal(stored.message_id, entry.messageId);
});

test('unknown events and mismatched personas cannot create phantom answers', t => {
  const { db, history } = memoryDatabase(t);

  assert.equal(history.appendReply({
    eventId: 'missing',
    persona: IDENTITY.persona,
    text: 'must not appear',
    at: BASE,
  }), false);

  assert.deepEqual(counts(db), { events: 0, replies: 0 });

  const entry = add(history);

  assert.equal(history.appendReply({
    eventId: entry.eventId,
    persona: 'other-persona',
    text: 'must not appear',
    at: BASE + 1,
  }), false);

  assert.deepEqual(counts(db), { events: 1, replies: 0 });
  assert.deepEqual(read(history), [expectedPair(entry)]);
});

test('reply ordinals are immutable, exact replays succeed, and ordering is explicit', t => {
  const { db, history } = memoryDatabase(t);
  const entry = add(history);

  publish(history, entry, {
    segment: 2,
    text: 'C',
    at: BASE + 2,
  });

  // Omitting segment must mean ordinal zero.
  const first = publish(history, entry, {
    text: 'A',
    at: BASE + 4,
  });

  const middle = publish(history, entry, {
    segment: 1,
    text: 'B',
    at: BASE + 3,
  });

  assert.equal(history.appendReply(first), true);
  assert.equal(history.appendReply(middle), true);
  assert.deepEqual(counts(db), { events: 1, replies: 3 });

  assert.equal(history.appendReply({
    ...middle,
    text: 'changed replacement',
  }), false);

  assert.equal(history.appendReply({
    ...middle,
    at: middle.at + 1,
  }), false);

  assert.equal(history.appendReply({
    ...middle,
    persona: 'other-persona',
  }), false);

  assert.deepEqual(
    read(history),
    [expectedPair(entry, 'ABC', BASE + 4)],
  );

  // Gaps are permitted; no missing text or punctuation is invented.
  publish(history, entry, {
    segment: 15,
    text: 'Z',
    at: BASE + 5,
  });

  assert.deepEqual(
    read(history),
    [expectedPair(entry, 'ABCZ', BASE + 5)],
  );
  assert.deepEqual(counts(db), { events: 1, replies: 4 });
});

test('an empty published segment differs from an unanswered message', t => {
  const { history } = memoryDatabase(t);

  const entry = add(history, {
    name: '',
    text: '',
    at: 0,
  });

  assert.deepEqual(read(history, { now: 0 }), [expectedPair(entry)]);

  publish(history, entry, { text: '', at: 0 });

  assert.deepEqual(
    read(history, { now: 0 }),
    [expectedPair(entry, '', 0)],
  );
});

test('all 16 complete segments survive without reply truncation', t => {
  const { db, history } = memoryDatabase(t);
  const entry = add(history, { text: 'Please retain the complete reply.' });

  const parts = Array.from(
    { length: 16 },
    (_, index) => String(index).padStart(2, '0') + '汉'.repeat(598),
  );

  for (let segment = 15; segment >= 0; segment--) {
    publish(history, entry, {
      segment,
      text: parts[segment],
      at: BASE + segment + 1,
    });
  }

  const expected = expectedPair(entry, parts.join(''), BASE + 16);
  const exactBudget = jsonBytes([expected]);

  assert.equal(expected.leaderReplied.length, 9600);
  assert.deepEqual(counts(db), { events: 1, replies: 16 });
  assert.deepEqual(read(history), []);
  assert.deepEqual(
    read(history, { maxChars: exactBudget }),
    [expected],
  );
  assert.deepEqual(
    read(history, { maxChars: exactBudget - 1 }),
    [],
  );
});

test('archive survives reopen, replacement instances, old age, and over 2048 messages', t => {
  const directory = mkdtempSync(join(tmpdir(), 'viewer-history-'));
  const filename = join(directory, 'history.sqlite');

  let db = new DatabaseSync(filename);

  t.after(() => {
    try {
      if (db.isOpen) db.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  let history = new ViewerHistory(db);
  let oldEntry;
  let firstReply;
  let secondReply;

  db.exec('BEGIN');
  try {
    oldEntry = add(history, {
      eventId: 'ancient-chinese-topic',
      messageId: 'test:ancient-chinese-topic',
      text: '我正在修复青铜天文钟，缺少一个擒纵轮。',
      at: BASE - 3 * DAY,
    });

    firstReply = publish(history, oldEntry, {
      text: '你提到了青铜天文钟。',
      at: oldEntry.at + 1,
    });

    secondReply = publish(history, oldEntry, {
      segment: 1,
      text: '我们讨论的是擒纵轮。',
      at: oldEntry.at + 2,
    });

    for (let index = 0; index < 2100; index++) {
      add(history, {
        eventId: `recent-${index}`,
        text: `普通签到消息 ${index}`,
        at: BASE + index,
      });
    }

    db.exec('COMMIT');
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }

  assert.deepEqual(counts(db), { events: 2101, replies: 2 });

  // A new object/browser Chat does not supply a new persona identity.
  history = new ViewerHistory(db);
  assert.equal(
    read(history, { limit: 12, maxChars: 10000 }).length,
    12,
  );

  db.close();
  db = new DatabaseSync(filename);
  history = new ViewerHistory(db);

  const recalled = read(history, {
    text: '还记得青铜天文钟的擒纵轮吗？',
    now: BASE + 400 * DAY,
  });

  const ancient = recalled.find(
    pair => pair.eventId === oldEntry.eventId,
  );

  assert.deepEqual(ancient, expectedPair(
    oldEntry,
    firstReply.text + secondReply.text,
    secondReply.at,
  ));

  assert(recalled.some(pair => pair.eventId === 'recent-2099'));
  assert(recalled.length <= 6);
  assert(jsonBytes(recalled) <= 2500);
  assert.deepEqual(counts(db), { events: 2101, replies: 2 });

  // Idempotence survives process-style database reopening.
  assert.equal(history.appendReply(firstReply), true);
  assert.equal(history.appendReply(secondReply), true);
  assert.equal(history.appendReply({
    ...secondReply,
    text: 'replacement after restart',
  }), false);

  assert.deepEqual(
    read(history, { persona: 'new-leader-persona' }),
    [],
  );
  assert.deepEqual(counts(db), { events: 2101, replies: 2 });

  assert.equal(history.withdraw([oldEntry.messageId]), 1);

  db.close();
  db = new DatabaseSync(filename);
  history = new ViewerHistory(db);

  assert.deepEqual(counts(db), { events: 2100, replies: 0 });
  assert.equal(db.prepare(`
    SELECT event_id
    FROM viewer_history_events
    WHERE event_id = ?;
  `).get(oldEntry.eventId), undefined);

  assert(!read(history, {
    text: '青铜天文钟的擒纵轮',
  }).some(pair => pair.eventId === oldEntry.eventId));
});

test('older English relevance outranks many newer partial matches', t => {
  const { history } = memoryDatabase(t);

  const older = add(history, {
    eventId: 'old-english-topic',
    text: 'We repaired the cobalt astrolabe.',
    at: BASE - 20 * DAY,
  });

  const replyOnly = add(history, {
    eventId: 'old-reply-topic',
    text: 'Which mechanism did you identify?',
    at: BASE - 19 * DAY,
  });

  publish(history, replyOnly, {
    text: 'A zephyr',
    at: replyOnly.at + 1,
  });
  publish(history, replyOnly, {
    segment: 1,
    text: 'chronometer.',
    at: replyOnly.at + 2,
  });

  for (let index = 0; index < 200; index++) {
    add(history, {
      eventId: `partial-${index}`,
      text: `Cobalt status update ${index}.`,
      at: BASE + index,
    });
  }

  const mixed = read(history, {
    text: 'Tell me about the cobalt astrolabe',
    limit: 2,
  });

  assert.deepEqual(eventIds(mixed), [
    older.eventId,
    'partial-199',
  ]);

  // Searches the exact complete reply, even across a segment boundary.
  assert.deepEqual(read(history, {
    text: 'ZEPHYRCHRONOMETER',
    limit: 1,
  }), [
    expectedPair(
      replyOnly,
      'A zephyrchronometer.',
      replyOnly.at + 2,
    ),
  ]);
});

test('excludeEventId applies before both relevance and recency selection', t => {
  const { history } = memoryDatabase(t);

  const older = add(history, {
    eventId: 'older',
    text: 'distinctive lunar mechanism',
    at: BASE,
  });

  add(history, {
    eventId: 'middle',
    text: 'ordinary message',
    at: BASE + 1,
  });

  const current = add(history, {
    eventId: 'current',
    text: 'distinctive lunar mechanism',
    at: BASE + 2,
  });

  assert.deepEqual(read(history, {
    text: current.text,
    excludeEventId: current.eventId,
    limit: 1,
  }), [expectedPair(older)]);

  assert.deepEqual(eventIds(read(history, {
    excludeEventId: current.eventId,
    limit: 10,
  })), ['middle', 'older']);

  assert.equal(read(history, {
    excludeEventId: 'unknown-event',
    limit: 10,
  }).length, 3);
});

test('platform, viewer, side, and persona are all independent identity dimensions', t => {
  const { db, history } = memoryDatabase(t);

  const platforms = [
    'test',
    'bilibili',
    'xiaohongshu',
    'youtube',
    'twitch',
  ];
  const viewers = [IDENTITY.viewerId, 'other-viewer'];
  const sides = ['demon', 'human'];
  const personas = [IDENTITY.persona, 'retired-persona'];
  const cases = [];

  for (const platform of platforms) {
    for (const viewerId of viewers) {
      for (const side of sides) {
        for (const persona of personas) {
          const scope = { platform, viewerId, side, persona };
          const entry = add(history, {
            ...scope,
            eventId: `identity-${cases.length}`,
            name: 'Identical nickname',
            text: 'shared distinctive needle',
          });

          const reply = publish(history, entry, {
            text: `reply for ${entry.eventId}`,
          });

          cases.push({ scope, entry, reply });
        }
      }
    }
  }

  for (const { scope, entry, reply } of cases) {
    assert.deepEqual(read(history, {
      ...scope,
      text: 'distinctive needle',
      limit: 10,
      maxChars: 10000,
    }), [expectedPair(entry, reply.text, reply.at)]);
  }

  assert.deepEqual(read(history, {
    persona: 'never-created-persona',
    text: 'distinctive needle',
  }), []);

  assert.deepEqual(counts(db), { events: 40, replies: 40 });

  const renamed = add(history, {
    eventId: 'same-viewer-new-name',
    name: 'A completely different nickname',
    text: 'shared distinctive needle',
    at: BASE + 1,
  });

  const personal = read(history, { text: 'distinctive needle' });
  assert.equal(personal.length, 2);
  assert(personal.some(pair => pair.eventId === renamed.eventId));
});

test('ranking ties are deterministic and independent of insertion order', t => {
  const { db, history } = memoryDatabase(t);

  for (const eventId of ['b', 'c', 'a']) {
    add(history, {
      eventId,
      text: 'same topic',
      at: BASE,
    });
  }

  assert.deepEqual(
    eventIds(read(history, { limit: 10 })),
    ['a', 'b', 'c'],
  );

  const expected = read(history, { text: 'same topic', limit: 10 });
  assert.deepEqual(eventIds(expected), ['a', 'b', 'c']);

  for (let index = 0; index < 3; index++) {
    assert.deepEqual(
      read(new ViewerHistory(db), { text: 'same topic', limit: 10 }),
      expected,
    );
  }
});

test('caller rollback restores arrivals, segments, projections, and withdrawals', t => {
  const { db, history } = memoryDatabase(t);

  const permanent = add(history, {
    eventId: 'permanent',
    messageId: 'test:permanent',
    text: 'permanent question',
  });

  const permanentReply = publish(history, permanent, {
    text: 'permanent answer',
  });

  let temporary;
  let temporarySegment;

  db.exec('BEGIN');

  const inTransaction = new ViewerHistory(db);
  assert.equal(db.isTransaction, true);

  temporary = add(inTransaction, {
    eventId: 'rolled-back-arrival',
    messageId: 'test:rolled-back-arrival',
    text: 'temporary question',
    at: BASE + 10,
  });

  publish(inTransaction, temporary, {
    text: 'temporary answer',
  });

  temporarySegment = publish(inTransaction, permanent, {
    segment: 1,
    text: ' temporary continuation',
    at: BASE + 20,
  });

  assert.equal(
    inTransaction.withdraw([permanent.messageId]),
    1,
  );

  assert.deepEqual(
    eventIds(read(inTransaction)),
    [temporary.eventId],
  );

  assert.throws(() => inTransaction.arrived(message({
    eventId: 'invalid-inside-transaction',
    at: -1,
  })));

  assert.equal(db.isTransaction, true);

  db.exec('ROLLBACK');

  assert.equal(db.isTransaction, false);
  assert.deepEqual(counts(db), { events: 1, replies: 1 });
  assert.deepEqual(read(history), [
    expectedPair(permanent, permanentReply.text, permanentReply.at),
  ]);

  // No JS deduplication cache may remember rows rolled back by the caller.
  assert.equal(history.arrived(temporary), true);
  assert.equal(history.appendReply(temporarySegment), true);

  const restored = read(history).find(
    pair => pair.eventId === permanent.eventId,
  );

  assert.equal(
    restored.leaderReplied,
    permanentReply.text + temporarySegment.text,
  );
});

test('fresh schema creation can itself be rolled back by the caller', t => {
  const db = new DatabaseSync(':memory:');

  t.after(() => {
    if (db.isOpen) db.close();
  });

  db.exec('BEGIN');
  const first = new ViewerHistory(db);
  const entry = add(first);
  publish(first, entry);

  assert.equal(db.isTransaction, true);
  db.exec('ROLLBACK');

  assert.equal(db.prepare(`
    SELECT count(*) AS n
    FROM sqlite_schema
    WHERE name GLOB 'viewer_history_*';
  `).get().n, 0);

  const replacement = new ViewerHistory(db);
  const replacementEntry = add(replacement);

  assert.deepEqual(
    read(replacement),
    [expectedPair(replacementEntry)],
  );
});

for (const foreignKeys of [true, false]) {
  test(`withdrawal physically deletes both tables with foreign keys ${foreignKeys}`, t => {
    const { db, history } = memoryDatabase(t, {
      enableForeignKeyConstraints: foreignKeys,
    });

    assert.equal(
      db.prepare('PRAGMA foreign_keys').get().foreign_keys,
      Number(foreignKeys),
    );

    const sharedId = 'test:shared-message';
    const removed = [
      add(history, {
        eventId: 'remove-demon',
        messageId: sharedId,
      }),
      add(history, {
        eventId: 'remove-human',
        side: 'human',
        messageId: sharedId,
      }),
      add(history, {
        eventId: 'remove-retired',
        persona: 'retired-persona',
        messageId: sharedId,
      }),
      add(history, {
        eventId: 'remove-other-viewer',
        viewerId: 'other-viewer',
        messageId: sharedId,
      }),
    ];

    for (const entry of removed) {
      publish(history, entry, { text: 'first' });
      publish(history, entry, {
        segment: 1,
        text: 'second',
        at: BASE + 2,
      });
    }

    const retained = [
      add(history, {
        platform: 'youtube',
        eventId: 'keep-other-platform',
        messageId: 'youtube:shared-message',
      }),
      add(history, {
        eventId: 'keep-longer-id',
        messageId: 'test:shared-message-more',
      }),
      add(history, {
        eventId: 'keep-null-id',
        messageId: null,
      }),
    ];

    for (const entry of retained) publish(history, entry);

    assert.deepEqual(counts(db), { events: 7, replies: 11 });
    assert.equal(history.withdraw([sharedId, sharedId]), 4);
    assert.deepEqual(counts(db), { events: 3, replies: 3 });

    for (const entry of removed) {
      assert.equal(db.prepare(`
        SELECT event_id
        FROM viewer_history_events
        WHERE event_id = ?;
      `).get(entry.eventId), undefined);

      assert.deepEqual(db.prepare(`
        SELECT reply_text
        FROM viewer_history_replies
        WHERE event_id = ?;
      `).all(entry.eventId), []);

      assert.equal(history.appendReply({
        eventId: entry.eventId,
        persona: entry.persona,
        text: 'late reply must not resurrect anything',
        at: BASE + 100,
      }), false);
    }

    assert.equal(history.withdraw([]), 0);
    assert.equal(history.withdraw(['test:unknown-message']), 0);
    assert.deepEqual(counts(db), { events: 3, replies: 3 });

    assert.equal(
      db.prepare('PRAGMA foreign_keys').get().foreign_keys,
      Number(foreignKeys),
    );
  });
}

test('withdrawal validates the complete batch before writing and treats IDs literally', t => {
  const { db, history } = memoryDatabase(t);
  const ids = [];

  for (let index = 0; index < 150; index++) {
    const messageId = index === 0
      ? 'test:%'
      : index === 1
        ? 'test:_'
        : `test:bulk-${index}`;

    const entry = add(history, {
      eventId: `bulk-${index}`,
      messageId,
    });

    publish(history, entry);
    ids.push(messageId);
  }

  const retained = add(history, {
    platform: 'youtube',
    eventId: 'retained-platform',
    messageId: 'youtube:bulk-2',
  });
  publish(history, retained);

  const originalIds = [...ids];

  // The invalid final element lies beyond the first SQL-sized batch.
  assert.throws(() => history.withdraw([...ids, 'youtube:']));
  assert.deepEqual(counts(db), { events: 151, replies: 151 });

  const sparse = [ids[0], , ids[1]];
  assert.throws(() => history.withdraw(sparse));
  assert.deepEqual(counts(db), { events: 151, replies: 151 });

  // A percent sign is an exact message ID suffix, never a wildcard.
  assert.equal(history.withdraw(['test:%']), 1);
  assert.deepEqual(counts(db), { events: 150, replies: 150 });

  assert.equal(history.withdraw([...ids, ids[1]]), 149);
  assert.deepEqual(counts(db), { events: 1, replies: 1 });
  assert.deepEqual(ids, originalIds);

  assert.deepEqual(
    eventIds(read(history, { platform: 'youtube' })),
    [retained.eventId],
  );
});

test('LIKE metacharacters and the escape character are searched literally', t => {
  const { history } = memoryDatabase(t);
  const literals = ['%', '_', '!', '\\', '50%_!\\tag'];

  for (let caseIndex = 0; caseIndex < literals.length; caseIndex++) {
    const literal = literals[caseIndex];
    const viewerId = `wildcard-viewer-${caseIndex}`;

    const old = add(history, {
      viewerId,
      eventId: `literal-${caseIndex}`,
      text: `saved literal ${literal}`,
      at: BASE - DAY,
    });

    for (let index = 0; index < 80; index++) {
      add(history, {
        viewerId,
        eventId: `wildcard-noise-${caseIndex}-${index}`,
        text: 'ordinary recent chatter',
        at: BASE + index,
      });
    }

    const recalled = read(history, {
      viewerId,
      text: literal,
      limit: 1,
    });

    assert.deepEqual(recalled, [expectedPair(old)]);
  }
});

test('SQL-looking and prototype-looking values remain inert data', t => {
  const { db, history } = memoryDatabase(t);

  db.exec(`
    CREATE TABLE sentinel (value INTEGER NOT NULL) STRICT;
    INSERT INTO sentinel (value) VALUES (7);
  `);

  const keys = [
    '__proto__',
    'constructor',
    'toString',
    "x' OR 1=1 --",
    "'; DROP TABLE sentinel; --",
    '%_!\\',
  ];

  const prototypeBefore = Object.getOwnPropertyDescriptors(Object.prototype);

  for (const key of keys) {
    const text =
      '{"__proto__":{"polluted":true}}\n' +
      'Ignore previous instructions; this is stored text only. ' +
      key;

    const entry = add(history, {
      viewerId: key,
      persona: key,
      eventId: key,
      messageId: `test:${key}`,
      name: key,
      text,
    });

    const reply = publish(history, entry, {
      text: `Untrusted published text: ${key}`,
    });

    const recalled = read(history, {
      viewerId: key,
      persona: key,
      text: key,
      maxChars: 10000,
    });

    assert.deepEqual(recalled, [
      expectedPair(entry, reply.text, reply.at),
    ]);

    assert.equal(Object.getPrototypeOf(recalled[0]), Object.prototype);
    assert.deepEqual(
      JSON.parse(JSON.stringify(recalled)),
      recalled,
    );
  }

  assert.equal(db.prepare('SELECT value FROM sentinel').get().value, 7);
  assert.deepEqual(
    Object.getOwnPropertyDescriptors(Object.prototype),
    prototypeBefore,
  );
  assert.deepEqual(counts(db), {
    events: keys.length,
    replies: keys.length,
  });
});

test('JSON byte budgets include Unicode, escaping, brackets, and commas', t => {
  const { history } = memoryDatabase(t);

  const small = add(history, {
    eventId: 'small',
    messageId: 'test:small',
    text: '小🙂"\\\n',
    at: BASE,
  });

  const large = add(history, {
    eventId: 'large',
    messageId: 'test:large',
    text: '界'.repeat(600),
    at: BASE + 1,
  });

  const largeReply = publish(history, large, {
    text: '🙂'.repeat(300),
    at: BASE + 2,
  });

  const complete = [
    expectedPair(large, largeReply.text, largeReply.at),
    expectedPair(small),
  ];

  assert.deepEqual(
    read(history, { maxChars: 100000 }),
    complete,
  );

  const smallBudget = jsonBytes([expectedPair(small)]);
  const completeBudget = jsonBytes(complete);

  assert.deepEqual(
    read(history, { limit: 1, maxChars: smallBudget }),
    [expectedPair(small)],
  );
  assert.deepEqual(
    read(history, { maxChars: smallBudget - 1 }),
    [],
  );
  assert.deepEqual(
    read(history, { maxChars: completeBudget }),
    complete,
  );

  for (const budget of [
    2,
    100,
    smallBudget,
    smallBudget + 1,
    2500,
    completeBudget - 1,
    completeBudget,
  ]) {
    const recalled = read(history, {
      maxChars: budget,
      limit: 10,
    });

    assert(jsonBytes(recalled) <= budget);

    for (const pair of recalled) {
      const original = complete.find(
        candidate => candidate.eventId === pair.eventId,
      );
      assert.deepEqual(pair, original);
    }
  }

  assert.deepEqual(read(history), [expectedPair(small)]);
  assert.deepEqual(read(history, { limit: 0 }), []);
});

test('arrival validation rejects invalid input before any insertion', t => {
  const { db, history } = memoryDatabase(t);

  const invalid = [
    { platform: '__proto__' },
    { platform: 'Twitch' },
    { side: 'constructor' },
    { viewerId: '' },
    { viewerId: 'v'.repeat(201) },
    { viewerId: 123 },
    { viewerId: new String('viewer') },
    { viewerId: 'viewer\0suffix' },
    { persona: '' },
    { persona: 'p'.repeat(201) },
    { name: 'n'.repeat(81) },
    { name: null },
    { eventId: '' },
    { eventId: 'e'.repeat(181) },
    { messageId: '' },
    { messageId: 'unprefixed' },
    { messageId: 'test:' },
    { messageId: 'youtube:wrong-platform' },
    { messageId: `test:${'m'.repeat(176)}` },
    { text: 't'.repeat(601) },
    { text: {} },
    { text: '\uD800' },
    { text: 'before\0after' },
    { at: -1 },
    { at: 0.5 },
    { at: NaN },
    { at: Infinity },
    { at: Number.MAX_SAFE_INTEGER + 1 },
    { at: '0' },
    { at: 0n },
  ];

  for (const override of invalid) {
    assert.throws(() => history.arrived(message(override)));
    assert.deepEqual(counts(db), { events: 0, replies: 0 });
  }

  assert.throws(() => history.arrived(null));
  assert.throws(() => new ViewerHistory(null));
  assert.throws(() => new ViewerHistory({}));
});

test('reply validation happens even when the event does not exist', t => {
  const { db, history } = memoryDatabase(t);

  const valid = {
    eventId: 'missing',
    persona: IDENTITY.persona,
    text: 'reply',
    at: BASE,
    segment: 0,
  };

  const invalid = [
    { eventId: '' },
    { eventId: 'e'.repeat(181) },
    { persona: '' },
    { persona: 'p'.repeat(201) },
    { text: 't'.repeat(601) },
    { text: null },
    { text: '\uDFFF' },
    { text: 'a\0b' },
    { at: -1 },
    { at: 0.5 },
    { at: NaN },
    { at: Infinity },
    { at: Number.MAX_SAFE_INTEGER + 1 },
    { at: 0n },
    { segment: -1 },
    { segment: 16 },
    { segment: 0.5 },
    { segment: '0' },
    { segment: NaN },
  ];

  for (const override of invalid) {
    assert.throws(() => history.appendReply({
      ...valid,
      ...override,
    }));
    assert.deepEqual(counts(db), { events: 0, replies: 0 });
  }
});

test('recall and withdrawal reject malformed options without mutation', t => {
  const { db, history } = memoryDatabase(t);
  add(history, { messageId: 'test:existing' });

  for (const override of [
    { platform: 'unknown' },
    { side: 'unknown' },
    { viewerId: '' },
    { persona: '' },
    { text: 'x'.repeat(601) },
    { text: null },
    { text: '\uD800' },
    { excludeEventId: '' },
    { excludeEventId: 'e'.repeat(181) },
    { now: -1 },
    { now: 0.5 },
    { now: NaN },
    { now: Infinity },
    { now: Number.MAX_SAFE_INTEGER + 1 },
    { now: '0' },
    { now: 0n },
  ]) {
    assert.throws(() => read(history, override));
  }

  for (const limit of [
    -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '6',
  ]) {
    assert.throws(() => read(history, { limit }));
  }

  for (const maxChars of [
    -1, 0, 1, 2.5, NaN, Infinity,
    Number.MAX_SAFE_INTEGER + 1, '2500',
  ]) {
    assert.throws(() => read(history, { maxChars }));
  }

  // Invalid options are not bypassed by a zero requested result count.
  assert.throws(() => read(history, {
    limit: 0,
    maxChars: 1,
  }));

  for (const value of [
    null,
    undefined,
    'test:existing',
    new Set(['test:existing']),
    [null],
    ['unknown:existing'],
    ['test:'],
  ]) {
    assert.throws(() => history.withdraw(value));
  }

  assert.deepEqual(counts(db), { events: 1, replies: 0 });
  assert.deepEqual(read(history, { limit: 0 }), []);
  assert.deepEqual(read(history, { maxChars: 2 }), []);
});

test('maximum accepted lengths and safe integer timestamps remain exact', t => {
  const { history } = memoryDatabase(t);

  const entry = add(history, {
    viewerId: 'v'.repeat(200),
    persona: 'p'.repeat(200),
    eventId: 'e'.repeat(180),
    messageId: `test:${'m'.repeat(175)}`,
    name: 'n'.repeat(80),
    text: '🙂'.repeat(300),
    at: Number.MAX_SAFE_INTEGER,
  });

  const reply = publish(history, entry, {
    segment: 15,
    text: '界'.repeat(600),
    at: Number.MAX_SAFE_INTEGER,
  });

  assert.deepEqual(read(history, {
    viewerId: entry.viewerId,
    persona: entry.persona,
    now: 0,
    maxChars: 10000,
  }), [expectedPair(entry, reply.text, reply.at)]);
});

test('now does not expire evidence or impose an undocumented as-of filter', t => {
  const { history } = memoryDatabase(t);

  const entry = add(history, {
    eventId: 'clock-jump',
    text: 'Evidence survives a wall-clock correction.',
    at: BASE + DAY,
  });

  const reply = publish(history, entry, {
    text: 'Published after the clock moved backwards.',
    at: BASE - 1,
  });

  const expected = [expectedPair(entry, reply.text, reply.at)];

  assert.deepEqual(read(history, { now: 0 }), expected);
  assert.deepEqual(
    read(history, { now: BASE + 1000 * DAY }),
    expected,
  );
});

test('recall transfers bounded SQL candidates and uses the identity index', t => {
  const { db } = memoryDatabase(t);
  const calls = [];

  // This adapter delegates every operation to a real DatabaseSync.
  // It observes row and parameter counts without changing SQL behavior.
  const observed = {
    exec(sql) {
      calls.push({ method: 'exec', sql, parameters: [] });
      return db.exec(sql);
    },

    prepare(sql) {
      const statement = db.prepare(sql);

      return {
        run(...parameters) {
          calls.push({ method: 'run', sql, parameters });
          return statement.run(...parameters);
        },

        get(...parameters) {
          calls.push({ method: 'get', sql, parameters });
          return statement.get(...parameters);
        },

        all(...parameters) {
          const rows = statement.all(...parameters);
          calls.push({
            method: 'all',
            sql,
            parameters,
            rowCount: rows.length,
          });
          return rows;
        },
      };
    },
  };

  const history = new ViewerHistory(observed);
  const messageIds = [];

  for (let index = 0; index < 300; index++) {
    const entry = add(history, {
      eventId: `bounded-${index}`,
      messageId: `test:bounded-${index}`,
      text: 'beacon',
      at: BASE + index,
    });
    messageIds.push(entry.messageId);
  }

  calls.length = 0;

  const recalled = read(history, {
    text: 'beacon',
    limit: Number.MAX_SAFE_INTEGER,
    maxChars: Number.MAX_SAFE_INTEGER,
  });

  const reads = calls.filter(call => call.method === 'all');

  assert.equal(reads.length, 1);
  assert.equal(reads[0].rowCount, 128);
  assert(reads[0].parameters.length <= 204);
  assert.equal(recalled.length, 64);
  assert.equal(new Set(eventIds(recalled)).size, recalled.length);
  assert.deepEqual(counts(db), { events: 300, replies: 0 });

  const plan = db.prepare(
    `EXPLAIN QUERY PLAN ${reads[0].sql}`,
  ).all(...reads[0].parameters);

  assert(plan.some(row =>
    row.detail.includes('viewer_history_identity')
  ));

  // More than 48 distinct query terms still produce at most 204 bindings.
  const longQuery = Array.from(
    { length: 120 },
    (_, index) => `w${index.toString(36)}`,
  ).join(' ');

  assert(longQuery.length <= 600);

  calls.length = 0;
  read(history, {
    text: longQuery,
    maxChars: Number.MAX_SAFE_INTEGER,
  });

  const boundedRead = calls.find(call => call.method === 'all');
  assert(boundedRead);
  assert.equal(boundedRead.parameters.length, 204);
  assert(boundedRead.rowCount <= 128);

  calls.length = 0;

  assert.equal(history.withdraw(messageIds), 300);

  const deletes = calls.filter(call => call.method === 'run');
  assert.equal(deletes.length, 3);
  assert(deletes.every(call => call.parameters.length === 128));
  assert.deepEqual(counts(db), { events: 0, replies: 0 });
});
