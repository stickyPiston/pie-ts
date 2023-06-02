import * as E from "./expr.ts";
import * as C from "./core.ts";
import * as V from "./value.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";

type Symbol = string;
type TopLevelEntry = { name: Symbol, type: "Claim" | "Define", value: V.Value };
export type Context = I.List<TopLevelEntry>;
export interface TopLevel {
  eval(gamma: Context): Context;
}

function to_expr_env(context: Context): E.Context {
    return context.map<E.ContextEntry>(({ name, type, value }) => {
        if (type === "Claim") {
            return { name, type: "Claim", value };
        } else {
            const claim = context.find(x => x.name === name && x.type === "Claim");
            if (claim) {
                return { name, type: "Define", value: { value, type: claim.value } };
            } else {
                throw new Error(`Missing claim for define for ${name}`);
            }
        }
    });
}

export class Define implements TopLevel {
  public constructor(public name: Symbol, public value: E.Expr) { }

  public eval(gamma: Context): Context {
    const claim = gamma.find(e => e.name === this.name && e.type === "Claim");
    const expr_env = to_expr_env(gamma);
      const core = this.value.check(expr_env, claim!.value);
      const value = core.eval(E.to_rho(expr_env));
      return gamma.push({ name: this.name, type: "Define", value });
  }
}

export class Claim implements TopLevel {
  constructor(public name: Symbol, public type: E.Expr) { }
  public eval(gamma: Context) {
    const expr_env = to_expr_env(gamma);
    const core = this.type.isType(expr_env);
    const value = core.eval(E.to_rho(expr_env));
    return gamma.push({ name: this.name, type: "Claim", value });
  }
}

export class CheckSame implements TopLevel {
  constructor(public type: E.Expr, public left: E.Expr, public right: E.Expr) { }
  public eval(gamma: Context) {
    const expr_env = to_expr_env(gamma);
    const rho = E.to_rho(expr_env);
    const type_value  = this.type.isType(expr_env).eval(rho);
    const left_value  = this.left.check(expr_env, type_value).eval(rho);
    const right_value = this.right.check(expr_env, type_value).eval(rho);

    const bound = C.to_bound(rho);
    left_value.same_value(rho, bound, type_value, right_value);

    return gamma;
  }
}
