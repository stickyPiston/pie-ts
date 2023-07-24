import peg from "npm:pegjs";
import * as E from "./expr.ts";
import * as A from "./pattern.ts";
import * as T from "./toplevel.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";

const grammar = await Deno.readTextFile("src/grammar.pegjs");
const parser = peg.generate(grammar, { dependencies: { E, A } });

export function parse(source: string): T.TopLevel[] {
    const dependencies = { E, A, T, I };
    return parser.parse.call(dependencies, source);
}