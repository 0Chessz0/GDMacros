/**
 * Server-safe validation for a zBot `.gdr` replay.
 *
 * zBot uses GDReplayFormat version 1, encoded as one MessagePack map. This
 * decoder deliberately supports the complete ordinary MessagePack value set
 * instead of searching for strings in the upload: a random file containing
 * `inputs` and `level` must not pass as a replay.
 */

export interface GdrMetadata {
  levelId: number;
  levelName: string;
  botName: string;
  botVersion: string;
  author: string;
  duration: number;
  framerate: number;
  inputCount: number;
}

export type GdrCheck =
  | { ok: true; info: GdrMetadata }
  | { ok: false; error: string };

const MAX_DEPTH = 48;
const MAX_COLLECTION_ITEMS = 1_000_000;

class MessagePackReader {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  private offset = 0;
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });

  constructor(input: ArrayBuffer | Uint8Array) {
    this.bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
  }

  get remaining() {
    return this.bytes.byteLength - this.offset;
  }

  private need(count: number) {
    if (!Number.isSafeInteger(count) || count < 0 || count > this.remaining) {
      throw new Error("truncated MessagePack value");
    }
  }

  private u8() {
    this.need(1);
    return this.view.getUint8(this.offset++);
  }

  private i8() {
    this.need(1);
    const value = this.view.getInt8(this.offset);
    this.offset += 1;
    return value;
  }

  private u16() {
    this.need(2);
    const value = this.view.getUint16(this.offset);
    this.offset += 2;
    return value;
  }

  private i16() {
    this.need(2);
    const value = this.view.getInt16(this.offset);
    this.offset += 2;
    return value;
  }

  private u32() {
    this.need(4);
    const value = this.view.getUint32(this.offset);
    this.offset += 4;
    return value;
  }

  private i32() {
    this.need(4);
    const value = this.view.getInt32(this.offset);
    this.offset += 4;
    return value;
  }

  private integer64(signed: boolean) {
    this.need(8);
    const value = signed
      ? this.view.getBigInt64(this.offset)
      : this.view.getBigUint64(this.offset);
    this.offset += 8;
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new Error("integer is too large");
    return number;
  }

  private float32() {
    this.need(4);
    const value = this.view.getFloat32(this.offset);
    this.offset += 4;
    return value;
  }

  private float64() {
    this.need(8);
    const value = this.view.getFloat64(this.offset);
    this.offset += 8;
    return value;
  }

  private raw(length: number) {
    this.need(length);
    const value = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  private string(length: number) {
    return this.decoder.decode(this.raw(length));
  }

  private array(length: number, depth: number): unknown[] {
    if (length > MAX_COLLECTION_ITEMS) throw new Error("array is too large");
    const out = new Array<unknown>(length);
    for (let i = 0; i < length; i++) out[i] = this.value(depth + 1);
    return out;
  }

  private map(length: number, depth: number): Record<string, unknown> {
    if (length > MAX_COLLECTION_ITEMS) throw new Error("map is too large");
    const out: Record<string, unknown> = Object.create(null);
    for (let i = 0; i < length; i++) {
      const key = this.value(depth + 1);
      if (typeof key !== "string") throw new Error("map key is not a string");
      if (Object.prototype.hasOwnProperty.call(out, key)) throw new Error("duplicate map key");
      out[key] = this.value(depth + 1);
    }
    return out;
  }

  value(depth = 0): unknown {
    if (depth > MAX_DEPTH) throw new Error("MessagePack nesting is too deep");
    const tag = this.u8();

    if (tag <= 0x7f) return tag;
    if (tag >= 0x80 && tag <= 0x8f) return this.map(tag & 0x0f, depth);
    if (tag >= 0x90 && tag <= 0x9f) return this.array(tag & 0x0f, depth);
    if (tag >= 0xa0 && tag <= 0xbf) return this.string(tag & 0x1f);
    if (tag >= 0xe0) return tag - 0x100;

    switch (tag) {
      case 0xc0:
        return null;
      case 0xc2:
        return false;
      case 0xc3:
        return true;
      case 0xc4:
        return this.raw(this.u8());
      case 0xc5:
        return this.raw(this.u16());
      case 0xc6:
        return this.raw(this.u32());
      case 0xca:
        return this.float32();
      case 0xcb:
        return this.float64();
      case 0xcc:
        return this.u8();
      case 0xcd:
        return this.u16();
      case 0xce:
        return this.u32();
      case 0xcf:
        return this.integer64(false);
      case 0xd0:
        return this.i8();
      case 0xd1:
        return this.i16();
      case 0xd2:
        return this.i32();
      case 0xd3:
        return this.integer64(true);
      case 0xd9:
        return this.string(this.u8());
      case 0xda:
        return this.string(this.u16());
      case 0xdb:
        return this.string(this.u32());
      case 0xdc:
        return this.array(this.u16(), depth);
      case 0xdd:
        return this.array(this.u32(), depth);
      case 0xde:
        return this.map(this.u16(), depth);
      case 0xdf:
        return this.map(this.u32(), depth);
      default:
        throw new Error("unsupported MessagePack value");
    }
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Reads and validates a complete zBot replay, returning its review metadata. */
export function checkGdr(input: ArrayBuffer | Uint8Array): GdrCheck {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < 32) {
    return { ok: false, error: "That ZBot macro is too small to be a real .gdr replay." };
  }

  let root: Record<string, unknown> | null;
  try {
    const reader = new MessagePackReader(bytes);
    root = object(reader.value());
    if (reader.remaining !== 0) {
      return { ok: false, error: "That ZBot macro has unexpected data after the replay." };
    }
  } catch {
    return { ok: false, error: "That file is not a readable ZBot .gdr replay." };
  }

  if (!root) return { ok: false, error: "That file is not a ZBot .gdr replay." };

  const version = finiteNumber(root.version);
  if (version !== 1) {
    return { ok: false, error: "Only GDReplayFormat version 1 ZBot files are accepted." };
  }

  const bot = object(root.bot);
  const level = object(root.level);
  const inputs = Array.isArray(root.inputs) ? root.inputs : null;
  if (!bot || !level || !inputs) {
    return { ok: false, error: "That ZBot macro is missing required replay information." };
  }

  const botName = typeof bot.name === "string" ? bot.name.trim() : "";
  const botVersion = typeof bot.version === "string" ? bot.version.trim() : "";
  if (!/^zbot$/i.test(botName) || !botVersion) {
    return { ok: false, error: "That .gdr file was not identified as a ZBot replay." };
  }

  const levelId = finiteNumber(level.id);
  const levelName = typeof level.name === "string" ? level.name.trim() : "";
  const duration = finiteNumber(root.duration);
  const framerate = finiteNumber(root.framerate);
  if (
    levelId === null ||
    !Number.isSafeInteger(levelId) ||
    levelId < 1 ||
    levelId > 999_999_999_999 ||
    !levelName ||
    duration === null ||
    duration < 0 ||
    framerate === null ||
    framerate <= 0
  ) {
    return { ok: false, error: "That ZBot macro has invalid level or timing information." };
  }

  if (inputs.length === 0) {
    return { ok: false, error: "That ZBot macro does not contain any inputs." };
  }

  let previousFrame = -1;
  for (const rawInput of inputs) {
    const replayInput = object(rawInput);
    const frame = replayInput ? finiteNumber(replayInput.frame) : null;
    if (
      !replayInput ||
      frame === null ||
      !Number.isSafeInteger(frame) ||
      frame < previousFrame ||
      typeof replayInput.down !== "boolean" ||
      typeof replayInput["2p"] !== "boolean" ||
      !Number.isSafeInteger(replayInput.btn) ||
      (replayInput.btn as number) < 1
    ) {
      return { ok: false, error: "That ZBot macro contains invalid input data." };
    }
    previousFrame = frame;
  }

  return {
    ok: true,
    info: {
      levelId,
      levelName,
      botName,
      botVersion,
      author: typeof root.author === "string" ? root.author : "",
      duration,
      framerate,
      inputCount: inputs.length,
    },
  };
}

export function readGdrMetadata(input: ArrayBuffer | Uint8Array): GdrMetadata | null {
  const checked = checkGdr(input);
  return checked.ok ? checked.info : null;
}
