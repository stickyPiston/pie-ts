import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";

export type Symbol = string;
export type Context<T> = I.Map<Symbol, T>;
