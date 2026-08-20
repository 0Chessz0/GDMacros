/**
 * Server-side sanity check for an uploaded .gdr2 replay.
 *
 * A browser-side check is advice, not enforcement, so this runs on the server
 * before the file is ever written to Storage. It deliberately does NOT decode
 * the inputs: the point is to reject something that is obviously not a replay,
 * not to re-implement the codec. Being over-strict here would reject real
 * recordings, which is worse than accepting a slightly odd one that an admin
 * will look at anyway.
 *
 * Header layout, ported from the same source as the desktop app's
 * `electron/gdr2.js`, which was checked against real xdBot and Mega Hack files:
 *
 *   "GDR" | version | inputTag | author | description | duration(f32)
 *   gameVersion | framerate(f64) | seed | coins | ldm | platformer
 *   botName | botVersion | levelId | levelName | extensionSize | ...
 *
 * Integers are LEB128 varints, strings are a varint length then that many
 * bytes, floats are big-endian.
 */

export interface Gdr2Check {
  ok: boolean;
  /** A message safe to show a visitor. Never a raw parser error. */
  error?: string;
  info?: { version: number; botName: string; levelId: number };
}

/** Reads just far enough to be confident this is a real GDR2 file. */
class Cursor {
  constructor(
    private readonly buf: Uint8Array,
    public pos = 0,
  ) {}

  get remaining() {
    return this.buf.length - this.pos;
  }

  bytes(n: number): Uint8Array {
    if (n < 0 || this.pos + n > this.buf.length) throw new Error("truncated");
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  varint(): number {
    let result = 0n;
    let shift = 0n;
    for (let i = 0; i < 10; i++) {
      if (this.pos >= this.buf.length) throw new Error("truncated");
      const b = this.buf[this.pos++];
      result |= BigInt(b & 0x7f) << shift;
      shift += 7n;
      if ((b & 0x80) === 0) return Number(result);
    }
    throw new Error("malformed varint");
  }

  /** A length-prefixed string. Only its bytes are needed, not its meaning. */
  string(): string {
    const len = this.varint();
    // A length that cannot fit is the clearest sign of a file that is not
    // really a replay, or has been truncated in transit.
    if (len > this.remaining) throw new Error("truncated");
    return new TextDecoder("latin1").decode(this.bytes(len));
  }

  skip(n: number) {
    this.bytes(n);
  }
}

export function checkGdr2(input: ArrayBuffer | Uint8Array): Gdr2Check {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);

  if (buf.length < 8) {
    return { ok: false, error: "That file is too small to be a macro." };
  }

  // The magic bytes. This is the real gate, and the reason MIME type is not
  // trusted anywhere: a browser will happily label anything as anything.
  if (buf[0] !== 0x47 || buf[1] !== 0x44 || buf[2] !== 0x52) {
    return { ok: false, error: "That file does not appear to be a valid GDR macro." };
  }

  try {
    const c = new Cursor(buf, 3);

    const version = c.varint();
    if (version !== 2) {
      return {
        ok: false,
        error: `That macro is GDR version ${version}. Only GDR2 files are accepted.`,
      };
    }

    c.string(); // inputTag
    c.string(); // author
    c.string(); // description
    c.skip(4); // duration, f32
    c.varint(); // gameVersion
    c.skip(8); // framerate, f64
    c.varint(); // seed
    c.varint(); // coins
    c.skip(1); // ldm
    c.skip(1); // platformer
    const botName = c.string();
    c.varint(); // botVersion
    const levelId = c.varint();
    c.string(); // levelName

    // The extension block declares its own size. If that runs past the end of
    // the file, the header is not internally consistent.
    const extSize = c.varint();
    if (extSize > c.remaining) {
      return { ok: false, error: "That macro file looks damaged or incomplete." };
    }

    return { ok: true, info: { version, botName, levelId } };
  } catch {
    // Every parser failure becomes the same visitor-facing sentence. The
    // distinction between "truncated" and "malformed varint" helps nobody
    // uploading a file, and leaking internals helps nobody at all.
    return { ok: false, error: "That macro file looks damaged or incomplete." };
  }
}
