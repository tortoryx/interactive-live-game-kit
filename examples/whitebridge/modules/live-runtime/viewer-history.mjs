import { Buffer } from 'node:buffer';

const PLATFORMS = new Set([
  'test',
  'bilibili',
  'xiaohongshu',
  'youtube',
  'twitch',
]);

const SIDES = new Set(['demon', 'human']);
const MAX_INTEGER = Number.MAX_SAFE_INTEGER;
const CANDIDATES_PER_STREAM = 64;
const MAX_QUERY_TERMS = 48;
const WITHDRAW_BATCH_SIZE = 128;

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'did', 'do',
  'for', 'from', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on',
  'or', 'our', 'please', 'recall', 'remember', 'tell', 'that',
  'the', 'this', 'to', 'was', 'we', 'were', 'what', 'with',
  'you', 'your',
]);

function stringValue(value, field, maximum, allowEmpty = false) {
  if (typeof value !== 'string') {
    throw new TypeError(`viewer_history: ${field} must be a string`);
  }

  // Length limits use JavaScript UTF-16 code units. Reject invalid Unicode
  // rather than allowing UTF-8 encoding to silently replace stored evidence.
  if (
    value.length > maximum ||
    (!allowEmpty && value.length === 0)
  ) {
    throw new RangeError(`viewer_history: invalid ${field} length`);
  }

  // SQLite text functions treat NUL specially; disallow it consistently.
  if (!value.isWellFormed() || value.includes('\0')) {
    throw new TypeError(`viewer_history: invalid ${field} encoding`);
  }
}

function integerValue(
  value,
  field,
  minimum = 0,
  maximum = MAX_INTEGER,
) {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new RangeError(`viewer_history: invalid ${field}`);
  }
}

function identityValues(platform, viewerId, side, persona) {
  if (!PLATFORMS.has(platform)) {
    throw new TypeError('viewer_history: invalid platform');
  }
  if (!SIDES.has(side)) {
    throw new TypeError('viewer_history: invalid side');
  }

  stringValue(viewerId, 'viewerId', 200);
  stringValue(persona, 'persona', 200);
}

function messageIdValue(messageId, expectedPlatform = null) {
  stringValue(messageId, 'messageId', 180);

  const separator = messageId.indexOf(':');
  const platform = messageId.slice(0, separator);

  if (
    separator <= 0 ||
    separator === messageId.length - 1 ||
    !PLATFORMS.has(platform) ||
    (expectedPlatform !== null && platform !== expectedPlatform)
  ) {
    throw new TypeError(
      'viewer_history: messageId must have a matching platform prefix',
    );
  }
}

function asciiLower(text) {
  return text.replace(/[A-Z]/g, character => character.toLowerCase());
}

function likePattern(term) {
  // "!" is the explicit SQL LIKE escape character. Backslash is literal.
  return `%${term.replace(/[!%_]/g, '!$&')}%`;
}

/**
 * Deterministic lexical terms:
 * - the complete literal query;
 * - non-Han letter/number words, excluding common English query words;
 * - short Han runs and overlapping Han bigrams.
 *
 * No stored text is normalized or truncated. Only search terms are derived.
 * Long queries are sampled deterministically, retaining the full query and
 * spreading the remaining terms across the candidate term list.
 */
function queryTerms(text) {
  const phrase = asciiLower(text.trim());
  if (phrase.length === 0) return [];

  const terms = new Map();

  const add = (term, weight) => {
    if (term.length === 0) return;
    terms.set(term, Math.max(weight, terms.get(term) ?? 0));
  };

  add(phrase, 64);

  const nonHanText = phrase.replace(/\p{Script=Han}+/gu, ' ');
  const words = nonHanText.match(/[\p{L}\p{N}]+/gu) ?? [];

  for (const word of words) {
    if (word.length >= 2 && !STOP_WORDS.has(word)) {
      add(word, Math.min(Array.from(word).length, 12));
    }
  }

  for (const match of phrase.matchAll(/\p{Script=Han}+/gu)) {
    const characters = Array.from(match[0]);

    if (characters.length === 1) {
      add(match[0], 1);
      continue;
    }

    if (characters.length <= 12) {
      add(match[0], Math.min(characters.length * 2, 24));
    }

    for (let index = 0; index + 1 < characters.length; index++) {
      add(characters[index] + characters[index + 1], 2);
    }
  }

  const entries = Array.from(terms.entries());
  if (entries.length <= MAX_QUERY_TERMS) return entries;

  const tail = entries.slice(1);
  const selected = [entries[0]];

  for (let index = 0; index < MAX_QUERY_TERMS - 1; index++) {
    const position = Math.floor(
      index * (tail.length - 1) / (MAX_QUERY_TERMS - 2),
    );
    selected.push(tail[position]);
  }

  return selected;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS viewer_history_events (
    event_id TEXT NOT NULL PRIMARY KEY
      CHECK (length(event_id) BETWEEN 1 AND 180),

    platform TEXT NOT NULL
      CHECK (
        platform IN (
          'test', 'bilibili', 'xiaohongshu', 'youtube', 'twitch'
        )
      ),

    viewer_id TEXT NOT NULL
      CHECK (length(viewer_id) BETWEEN 1 AND 200),

    name TEXT NOT NULL
      CHECK (length(name) <= 80),

    side TEXT NOT NULL
      CHECK (side IN ('demon', 'human')),

    persona TEXT NOT NULL
      CHECK (length(persona) BETWEEN 1 AND 200),

    message_id TEXT,

    viewer_text TEXT NOT NULL
      CHECK (length(viewer_text) <= 600),

    received_at INTEGER NOT NULL
      CHECK (received_at BETWEEN 0 AND 9007199254740991),

    leader_reply TEXT
      CHECK (leader_reply IS NULL OR length(leader_reply) <= 9600),

    replied_at INTEGER
      CHECK (
        replied_at IS NULL
        OR replied_at BETWEEN 0 AND 9007199254740991
      ),

    CHECK (
      message_id IS NULL
      OR (
        length(message_id) <= 180
        AND length(message_id) > length(platform) + 1
        AND substr(message_id, 1, length(platform) + 1)
          = (platform || ':')
      )
    ),

    CHECK (
      (leader_reply IS NULL) = (replied_at IS NULL)
    )
  ) STRICT;

  CREATE TABLE IF NOT EXISTS viewer_history_replies (
    event_id TEXT NOT NULL
      CHECK (length(event_id) BETWEEN 1 AND 180),

    segment INTEGER NOT NULL
      CHECK (segment BETWEEN 0 AND 15),

    reply_text TEXT NOT NULL
      CHECK (length(reply_text) <= 600),

    replied_at INTEGER NOT NULL
      CHECK (replied_at BETWEEN 0 AND 9007199254740991),

    PRIMARY KEY (event_id, segment),

    FOREIGN KEY (event_id)
      REFERENCES viewer_history_events(event_id)
      ON DELETE CASCADE
  ) STRICT;

  CREATE INDEX IF NOT EXISTS viewer_history_identity
    ON viewer_history_events (
      platform,
      viewer_id,
      side,
      persona,
      received_at DESC,
      event_id COLLATE BINARY ASC
    );

  CREATE INDEX IF NOT EXISTS viewer_history_message_id
    ON viewer_history_events (message_id);

  CREATE TRIGGER IF NOT EXISTS viewer_history_reply_projection
  AFTER INSERT ON viewer_history_replies
  BEGIN
    UPDATE viewer_history_events
    SET
      leader_reply = (
        SELECT group_concat(reply_text, '' ORDER BY segment)
        FROM viewer_history_replies
        WHERE event_id = NEW.event_id
      ),
      replied_at = (
        SELECT max(replied_at)
        FROM viewer_history_replies
        WHERE event_id = NEW.event_id
      )
    WHERE event_id = NEW.event_id;
  END;

  CREATE TRIGGER IF NOT EXISTS viewer_history_delete_replies
  AFTER DELETE ON viewer_history_events
  BEGIN
    DELETE FROM viewer_history_replies
    WHERE event_id = OLD.event_id;
  END;
`;

/**
 * Only internal constants and a bounded term count construct this SQL.
 * Every caller-supplied value is bound as a parameter.
 *
 * Both candidate streams are selected in one SQLite statement, so their
 * contents and the exact reply projections share one read snapshot.
 */
function recallSQL(termCount) {
  const scope = `
    e.platform = ?
    AND e.viewer_id = ?
    AND e.side = ?
    AND e.persona = ?
    AND (? IS NULL OR e.event_id <> ?)
  `;

  const score = Array.from(
    { length: termCount },
    () => `
      (
        CASE
          WHEN lower(e.viewer_text) LIKE ? ESCAPE '!'
          THEN ? ELSE 0
        END
        +
        CASE
          WHEN lower(e.leader_reply) LIKE ? ESCAPE '!'
          THEN ? ELSE 0
        END
      )
    `,
  ).join(' + ') || '0';

  return `
    WITH recent AS (
      SELECT e.event_id, e.received_at
      FROM viewer_history_events AS e
        INDEXED BY viewer_history_identity
      WHERE ${scope}
      ORDER BY
        e.received_at DESC,
        e.event_id COLLATE BINARY ASC
      LIMIT ${CANDIDATES_PER_STREAM}
    ),
    scored AS (
      SELECT
        e.event_id,
        e.received_at,
        (${score}) AS score
      FROM viewer_history_events AS e
        INDEXED BY viewer_history_identity
      WHERE ${scope}
      ${termCount === 0 ? 'AND 0' : ''}
    ),
    relevant AS (
      SELECT event_id, received_at, score
      FROM scored
      WHERE score > 0
      ORDER BY
        score DESC,
        received_at DESC,
        event_id COLLATE BINARY ASC
      LIMIT ${CANDIDATES_PER_STREAM}
    ),
    candidates AS (
      SELECT event_id, received_at, score, 0 AS source
      FROM relevant

      UNION ALL

      SELECT event_id, received_at, 0 AS score, 1 AS source
      FROM recent
    )
    SELECT
      c.source,
      c.score,
      e.event_id,
      e.message_id,
      e.viewer_text,
      e.leader_reply,
      e.received_at,
      e.replied_at
    FROM candidates AS c
    JOIN viewer_history_events AS e
      ON e.event_id = c.event_id
    ORDER BY
      c.source ASC,
      c.score DESC,
      c.received_at DESC,
      c.event_id COLLATE BINARY ASC;
  `;
}

/**
 * Durable history on a caller-owned DatabaseSync.
 *
 * The caller owns connection configuration, transaction boundaries, identity
 * authorization, persona selection, and confirmation of actual publication.
 *
 * This namespace is module-owned. Do not directly mutate its tables:
 * leader_reply is an exact, trigger-maintained concatenation, not a summary.
 */
export class ViewerHistory {
  #db;
  #insertArrival;
  #insertReply;
  #existingReply;
  #deleteMessages;
  #recallStatements = new Map();

  constructor(db) {
    if (
      db === null ||
      typeof db !== 'object' ||
      typeof db.exec !== 'function' ||
      typeof db.prepare !== 'function'
    ) {
      throw new TypeError(
        'viewer_history: expected a DatabaseSync-compatible connection',
      );
    }

    this.#db = db;

    // No connection pragmas or transaction-control statements are issued.
    // BEGIN/END inside CREATE TRIGGER delimit trigger bodies, not transactions.
    db.exec(SCHEMA);

    this.#insertArrival = db.prepare(`
      INSERT INTO viewer_history_events (
        event_id,
        platform,
        viewer_id,
        name,
        side,
        persona,
        message_id,
        viewer_text,
        received_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (event_id) DO NOTHING;
    `);

    this.#insertReply = db.prepare(`
      INSERT INTO viewer_history_replies (
        event_id,
        segment,
        reply_text,
        replied_at
      )
      SELECT e.event_id, ?, ?, ?
      FROM viewer_history_events AS e
      WHERE e.event_id = ? AND e.persona = ?
      ON CONFLICT (event_id, segment) DO NOTHING;
    `);

    this.#existingReply = db.prepare(`
      SELECT r.reply_text, r.replied_at
      FROM viewer_history_replies AS r
      JOIN viewer_history_events AS e
        ON e.event_id = r.event_id
      WHERE
        r.event_id = ?
        AND e.persona = ?
        AND r.segment = ?;
    `);

    const placeholders = Array(WITHDRAW_BATCH_SIZE).fill('?').join(', ');

    this.#deleteMessages = db.prepare(`
      DELETE FROM viewer_history_events
      WHERE message_id IN (${placeholders});
    `);
  }

  arrived({
    platform,
    viewerId,
    name,
    side,
    persona,
    eventId,
    messageId = null,
    text,
    at,
  }) {
    identityValues(platform, viewerId, side, persona);
    stringValue(name, 'name', 80, true);
    stringValue(eventId, 'eventId', 180);
    stringValue(text, 'text', 600, true);
    integerValue(at, 'at');

    if (messageId !== null) {
      messageIdValue(messageId, platform);
    }

    const result = this.#insertArrival.run(
      eventId,
      platform,
      viewerId,
      name,
      side,
      persona,
      messageId,
      text,
      at,
    );

    // The first accepted event is immutable, including its identity and time.
    return Number(result.changes) === 1;
  }

  appendReply({
    eventId,
    persona,
    text,
    at,
    segment = 0,
  }) {
    stringValue(eventId, 'eventId', 180);
    stringValue(persona, 'persona', 200);
    stringValue(text, 'text', 600, true);
    integerValue(at, 'at');
    integerValue(segment, 'segment', 0, 15);

    const result = this.#insertReply.run(
      segment,
      text,
      at,
      eventId,
      persona,
    );

    if (Number(result.changes) === 1) return true;

    // An exact replay is accepted without mutation. A replacement, unknown
    // event, or mismatched persona is rejected without creating an answer.
    const existing = this.#existingReply.get(eventId, persona, segment);

    return (
      existing !== undefined &&
      existing.reply_text === text &&
      existing.replied_at === at
    );
  }

  withdraw(messageIds) {
    if (!Array.isArray(messageIds)) {
      throw new TypeError('viewer_history: messageIds must be an array');
    }

    // Snapshot and validate the entire input before the first DELETE.
    // This also rejects sparse arrays rather than silently ignoring holes.
    const validated = [];
    for (const messageId of messageIds) {
      messageIdValue(messageId);
      validated.push(messageId);
    }

    const uniqueIds = Array.from(new Set(validated));
    let deleted = 0;

    for (
      let offset = 0;
      offset < uniqueIds.length;
      offset += WITHDRAW_BATCH_SIZE
    ) {
      const batch = uniqueIds.slice(offset, offset + WITHDRAW_BATCH_SIZE);

      // A fixed statement bounds the parameter count. NULL cannot match a
      // stored non-NULL message ID and is only internal padding.
      while (batch.length < WITHDRAW_BATCH_SIZE) batch.push(null);

      deleted += Number(this.#deleteMessages.run(...batch).changes);
    }

    // This counts received events, not their deleted child segments.
    // Multi-batch atomicity belongs to the caller's surrounding transaction.
    return deleted;
  }

  recall({
    platform,
    viewerId,
    side,
    persona,
    text,
    now,
    limit = 6,
    maxChars = 2500,
    excludeEventId = null,
  }) {
    identityValues(platform, viewerId, side, persona);
    stringValue(text, 'text', 600, true);
    integerValue(now, 'now');
    integerValue(limit, 'limit');

    // Even the JSON representation of an empty array requires two bytes.
    integerValue(maxChars, 'maxChars', 2);

    if (excludeEventId !== null) {
      stringValue(excludeEventId, 'excludeEventId', 180);
    }

    if (limit === 0 || maxChars === 2) return [];

    // "now" is validated but does not expire or hide accepted evidence.
    // Relative dates and as-of-time filtering are deliberately not inferred.
    const terms = queryTerms(text);

    let statement = this.#recallStatements.get(terms.length);
    if (statement === undefined) {
      statement = this.#db.prepare(recallSQL(terms.length));
      this.#recallStatements.set(terms.length, statement);
    }

    const scopeParameters = [
      platform,
      viewerId,
      side,
      persona,
      excludeEventId,
      excludeEventId,
    ];

    // Placeholder order follows: recent scope, score terms, scored scope.
    const parameters = [...scopeParameters];

    for (const [term, weight] of terms) {
      const pattern = likePattern(term);
      parameters.push(pattern, weight * 2, pattern, weight);
    }

    parameters.push(...scopeParameters);

    // At most 128 rows cross into JS, including duplicate stream membership.
    const candidates = statement.all(...parameters);

    const streams = [
      candidates.filter(candidate => candidate.source === 0),
      candidates.filter(candidate => candidate.source === 1),
    ];

    const seen = new Set();
    const result = [];
    let usedBytes = 2;

    const rounds = Math.max(streams[0].length, streams[1].length);

    // Alternate relevant and recent evidence, starting with relevance.
    // Oversized candidates are skipped whole; later smaller pairs may fit.
    for (let index = 0; index < rounds; index++) {
      for (const stream of streams) {
        const candidate = stream[index];

        if (
          candidate === undefined ||
          seen.has(candidate.event_id)
        ) {
          continue;
        }

        seen.add(candidate.event_id);

        const pair = {
          eventId: candidate.event_id,
          messageId: candidate.message_id,
          viewerSaid: candidate.viewer_text,
          leaderReplied: candidate.leader_reply,
          receivedAt: candidate.received_at,
          repliedAt: candidate.replied_at,
        };

        const additionalBytes =
          Buffer.byteLength(JSON.stringify(pair), 'utf8') +
          (result.length === 0 ? 0 : 1);

        if (usedBytes + additionalBytes > maxChars) continue;

        result.push(pair);
        usedBytes += additionalBytes;

        if (result.length >= limit) return result;
      }
    }

    return result;
  }
}
