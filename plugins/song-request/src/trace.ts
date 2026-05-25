import { LunaUnload, Tracer } from "@luna/core";

export const { trace } = Tracer("[TidalunaSongRequest]");
export const unloads = new Set<LunaUnload>();
