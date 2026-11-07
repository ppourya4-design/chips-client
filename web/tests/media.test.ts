import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  chipsImageIdFromMessage,
  isMediaId,
  mediaUrl,
} from "../src/media";
import {
  encodeStyleToken,
  normalizeProfileStyle,
  parseStyleToken,
  replaceStyleToken,
  type ProfileStyle,
} from "../src/profileStyle";

const ID = "9f2c41ab07e34d5f8a1c0e5b6d7a33f0.jpg";
const GIF_ID = "0123456789abcdef0123456789abcdef.gif";

test("isMediaId accepts endpoint ids and rejects lookalikes", () => {
  assert.equal(isMediaId(ID), true);
  assert.equal(isMediaId(GIF_ID), true);
  assert.equal(isMediaId("9f2c41ab07e34d5f8a1c0e5b6d7a33f0"), false); // no extension
  assert.equal(isMediaId("9f2c41ab07e34d5f8a1c0e5b6d7a33f0.exe"), false);
  assert.equal(isMediaId("../9f2c41ab07e34d5f8a1c0e5b6d7a33f0.jpg"), false);
  assert.equal(isMediaId(""), false);
  assert.equal(isMediaId(undefined), false);
  assert.equal(isMediaId(42), false);
});

test("mediaUrl builds the public view URL", () => {
  assert.equal(mediaUrl(ID), `https://chips.poyzo.ir/i/${ID}`);
});

test("chipsImageIdFromMessage matches whole-message image URLs only", () => {
  assert.equal(chipsImageIdFromMessage(`https://chips.poyzo.ir/i/${ID}`), ID);
  assert.equal(chipsImageIdFromMessage(`  https://chips.poyzo.ir/i/${ID}  `), ID);
  assert.equal(
    chipsImageIdFromMessage(`[URL]https://chips.poyzo.ir/i/${ID}[/URL]`),
    ID,
  );
  assert.equal(
    chipsImageIdFromMessage(`[url=https://chips.poyzo.ir/i/${ID}]https://chips.poyzo.ir/i/${ID}[/url]`),
    ID,
  );
  // A link inside a sentence stays a link.
  assert.equal(chipsImageIdFromMessage(`look https://chips.poyzo.ir/i/${ID} nice`), null);
  // Other hosts and plain text never match.
  assert.equal(chipsImageIdFromMessage(`https://example.com/i/${ID}`), null);
  assert.equal(chipsImageIdFromMessage("hello"), null);
});

test("style token round-trips the banner id (bi=)", () => {
  const style: ProfileStyle = {
    ...normalizeProfileStyle(null),
    bannerId: GIF_ID,
  };
  const token = encodeStyleToken(style);
  assert.match(token, new RegExp(`bi=${GIF_ID.replace(".", "\\.")}`));
  const parsed = parseStyleToken(`my description ${token}`);
  assert.equal(parsed?.bannerId, GIF_ID);
});

test("legacy tokens without bi= still parse, with no banner id", () => {
  const legacy =
    "[s:v1;fx=shimmer;c1=74e5ff;c2=a74cfd;ring=gradient;talk=1;bg=74e5ff,a74cfd;dir=135;card=172334,26354a]";
  const parsed = parseStyleToken(legacy);
  assert.ok(parsed);
  assert.equal(parsed.bannerId, undefined);
  assert.equal(parsed.name.style, "shimmer");
});

test("normalizeProfileStyle drops malformed banner ids", () => {
  assert.equal(normalizeProfileStyle({ bannerId: "not-an-id" }).bannerId, undefined);
  assert.equal(normalizeProfileStyle({ bannerId: "../../etc/passwd" }).bannerId, undefined);
  assert.equal(normalizeProfileStyle({ bannerId: ID }).bannerId, ID);
});

test("replaceStyleToken preserves surrounding description text", () => {
  const style = normalizeProfileStyle({ bannerId: ID });
  const token = encodeStyleToken(style);
  const out = replaceStyleToken("busy, do not disturb", token);
  assert.ok(out.startsWith("busy, do not disturb "));
  assert.equal(parseStyleToken(out)?.bannerId, ID);
});
