import test from "node:test";
import assert from "node:assert/strict";
import { cleanPlayerName, hasPlayerName } from "../js/player-search.js";
import { findCheckInMatches } from "../js/checkin.js";

test("check-in search ignores whitespace variations and preserves spelling", () => {
  const players = { legacy: { key: "alice  smith", dn: "Alice  Smith" } };
  for (const query of [
    " Alice Smith ",
    "alice   smith",
    "ALICE\tSMITH",
    "Alice\u00a0Smith",
  ]) {
    assert.deepEqual(findCheckInMatches(players, [], query), [players.legacy]);
    assert.equal(hasPlayerName(players, query), true);
    assert.deepEqual(
      findCheckInMatches(players, [{ key: "alice  smith" }], query),
      [],
    );
  }
  assert.equal(cleanPlayerName("  José  O’Neil  "), "José O’Neil");
  assert.equal(hasPlayerName(players, "AliceSmith"), false);
});
