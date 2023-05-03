import { Context, Symbol } from "./utils.ts";
import { Expr } from "./expr.ts";
import { Value } from "./value.ts";

type TopLevelEntry = { type: "Claim" | "Define", value: Value };
export interface TopLevel {
  evaluate: (gamma: Context<TopLevelEntry>) => Context<TopLevelEntry>
}

export class Define implements TopLevel {
  constructor(public name: Symbol, public value: Expr) { }
  public evaluate(gamma: Context<TopLevelEntry>) {
    const claim = gamma.find(e => e.type === "Claim");
    if (claim) {
      const core = this.value.check(claim.value);
      const value = core.normalise();
      return gamma.push({ name: this.name, type: "Define", value });
    } else {
      return gamma;
    }
  }
}

export class Claim implements TopLevel {
  constructor(public name: Symbol, public type: Expr) { }
  public evaluate(gamma: Context<TopLevelEntry>) {
    const core = this.type.isType();
    const value = core.normalise();
    return gamma.push({ name: this.name, type: "Claim", value });
  }
}

export class CheckSame implements TopLevel {
  constructor(public type: Expr, public left: Expr, public right: Expr) { }
  public evaluate(gamma: Context<TopLevelEntry>) {
    const type_value  = this.type.isType().normalise();
    const left_value  = this.left.check(type_value).normalise();
    const right_value = this.right.check(type_value).normalise();

    // TODO: There needs to be some error handling that i need to work out
    left_value.sameValue(type_value, right_value);

    return gamma;
  }
}
