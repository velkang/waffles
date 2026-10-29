import { Buffer } from "buffer";
// Anchor's browser client uses Buffer for instruction and account encoding.
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
