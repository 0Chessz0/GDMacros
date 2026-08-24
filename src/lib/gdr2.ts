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

  /** Big-endian, as the format stores them. */
  f32(): number {
    const b = this.bytes(4);
    return new DataView(b.buffer, b.byteOffset, 4).getFloat32(0, false);
  }

  f64(): number {
    const b = this.bytes(8);
    return new DataView(b.buffer, b.byteOffset, 8).getFloat64(0, false);
  }

  byte(): number {
    return this.bytes(1)[0];
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

/* ------------------------------------------------------------------ *
 * Metadata, for a reviewer
 * ------------------------------------------------------------------ */

/**
 * What the file itself claims about a recording.
 *
 * Every field here is read by the same walk `checkGdr2` already performs, in
 * the same order, from a layout that has been exercised against real xdBot and
 * Mega Hack files. Nothing is guessed and nothing beyond the declared extension
 * block is parsed: the input stream layout has no reference implementation
 * available here, and showing a reviewer a confidently wrong number is worse
 * than showing them nothing.
 */
export interface Gdr2Metadata {
  version: number;
  /** The tool that wrote the file, as the file states it. */
  botName: string;
  botVersion: number;
  /** The level the RECORDING says it is for. Not what the submitter typed. */
  levelId: number;
  levelName: string;
  /** Seconds, or null when the file left it at zero. */
  duration: number | null;
  framerate: number | null;
  gameVersion: number;
  platformer: boolean;
  lowDetail: boolean;
  coins: number;
  /** Author string embedded by the recorder. Often empty. */
  author: string;
  description: string;
  /** Declared size of the extension block, in bytes. */
  extensionBytes: number;
}

/**
 * Reads the header for review, returning null rather than throwing.
 *
 * Separate from `checkGdr2` on purpose. That function is a GATE on the upload
 * path and its behaviour must not shift because a display field was added here.
 * This one runs later, for an admin looking at a file that was already accepted
 * as plausible.
 */
export function readGdr2Metadata(input: ArrayBuffer | Uint8Array): Gdr2Metadata | null {
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (buf.length < 8) return null;
  if (buf[0] !== 0x47 || buf[1] !== 0x44 || buf[2] !== 0x52) return null;

  try {
    const c = new Cursor(buf, 3);

    const version = c.varint();
    if (version !== 2) return null;

    c.string(); // inputTag
    const author = c.string();
    const description = c.string();
    const duration = c.f32();
    const gameVersion = c.varint();
    const framerate = c.f64();
    c.varint(); // seed
    const coins = c.varint();
    const lowDetail = c.byte() !== 0;
    const platformer = c.byte() !== 0;
    const botName = c.string();
    const botVersion = c.varint();
    const levelId = c.varint();
    const levelName = c.string();
    const extensionBytes = c.varint();

    if (extensionBytes > c.remaining) return null;

    return {
      version,
      botName,
      botVersion,
      levelId,
      levelName,
      // Both are left at zero by some recorders, which is not the same as
      // "zero seconds" or "zero fps" and should not be rendered as though it
      // were a measurement.
      duration: Number.isFinite(duration) && duration > 0 ? duration : null,
      framerate: Number.isFinite(framerate) && framerate > 0 ? framerate : null,
      gameVersion,
      platformer,
      lowDetail,
      coins,
      author,
      description,
      extensionBytes,
    };
  } catch {
    return null;
  }
}
