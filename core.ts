import * as V from "./value.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";

type Symbol = string;
type Renaming = I.Map<Symbol, Symbol>;

export abstract class Core {
  public abstract eval(_gamma: V.Rho): V.Value {
      throw new Error(`Cannot evaluate ${this}`);
  }

  public abstract alpha_equiv(other: Core, context?: { left: Renaming, right: Renaming }): void;
}

export class Var extends Core {
    public constructor(public name: Symbol) { super(); }
    public override eval(gamma: V.Rho): V.Value {
        if (gamma.has(this.name)) {
            return gamma.get(this.name) as V.Value;
        } else {
            throw new Error(`Could not find variable ${this.name}`);
        }
    }
}

export class Nat extends Core {
    public override eval(_gamma: V.Rho) {
        return new V.Nat();
    }
}

export class Atom extends Core {
    public override eval(_gamma: V.Rho): V.Value {
        return new V.Atom();
    }
}

export class Tick extends Core {
  public constructor(public name: Symbol) { super(); }
  public override eval(_gamma: V.Rho): V.Value {
      return new V.Tick(this.name);
  }
}

export class Sigma implements Core {
  public constructor(public name: Symbol, public value: Core, public body: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_value = this.value.eval(gamma);
      const clos_body = new V.Closure(gamma, this.body);
      return new V.Sigma(this.name, eval_value, clos_body);
  }
}

export class Cons extends Core {
  public constructor(public left: Core, public right: Core) { super(); }
  public override eval(context: V.Rho): V.Value {
      return new V.Cons(this.left.eval(context), this.right.eval(context));
  }
}

export class Car extends Core {
  public constructor(public pair: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_pair = this.pair.eval(gamma) as V.Cons;
      return eval_pair.fst;
  }
}

export class Cdr extends Core {
  public constructor(public pair: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_pair = this.pair.eval(gamma) as V.Cons;
      return eval_pair.snd;
  }
}

export class Pi extends Core {
  public constructor(public name: Symbol, public value: Core, public body: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const clos_body = new V.Closure(gamma, this.body);
      return new V.Pi(this.name, this.value.eval(gamma), clos_body);
  }
}

export class Lambda extends Core {
  public constructor(public name: Symbol, public body: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const clos_body = new V.Closure(gamma, this.body);
      return new V.Lambda(this.name, clos_body);
  }
}

export class Appl extends Core {
  public constructor(public func: Core, public arg: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_func = this.func.eval(gamma);
      const eval_arg = this.arg.eval(gamma);
      return V.apply_many(eval_func, eval_arg);
  }
}

export class Zero extends Core {
  public override eval(_gamma: V.Rho): V.Value {
      return new V.Zero();
  }
}

export class Add1 extends Core {
  public constructor(public num: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_n = this.num.eval(gamma);
      return new V.Add1(eval_n);
  }
}

export class WhichNat extends Core {
  public constructor(public target: Core, public base_type: V.Value,
                     public base_expr: Core, public add1: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_target = this.target.eval(gamma);
      if (eval_target instanceof V.Zero) {
          return this.base_expr.eval(gamma);
      } else {
          return this.add1.eval(gamma);
      }
  }
}

export class IterNat extends Core {
  public constructor(public target: Core, public base_type: V.Value,
                     public base_expr: Core, public add1: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_target = this.target.eval(gamma);
      return IterNat.do(eval_target, this.base_expr.eval(gamma), this.add1.eval(gamma));
  }

  public static do(n: V.Zero | V.Add1, base: V.Value, step: V.Value): V.Value {
      if (n instanceof V.Zero) {
          return base;
      } else {
          return V.apply_many(step, IterNat.do(n.n, base, step)); 
      }
  }
}

export class RecNat extends Core {
  public constructor(public target: Core, public base_type: V.Value,
                     public base: Core, public add1: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_target = this.target.eval(gamma);
      return RecNat.do(eval_target, this.base.eval(gamma), this.add1.eval(gamma));
  }

  public static do(n: V.Add1 | V.Zero, base: V.Value, step: V.Value): V.Value {
      if (n instanceof V.Zero) {
          return base;
      } else {
          return V.apply_many(step, n.n, RecNat.do(n.n, base, step));
      }
  }
}

export class IndNat extends Core {
  public constructor(public target: Core, public motive: Core,
                     public base_expr: Core, public add1: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_target = this.target.eval(gamma);
      return RecNat.do(eval_target, this.base_expr.eval(gamma), this.add1.eval(gamma));
  }
}

export class List implements Core {
  public constructor(public e: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Zero(); } // TODO
}

export class Nil implements Core {
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Nil(); }
}

export class ListCons implements Core {
  public constructor(public head: Core, public tail: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Nil(); } // TODO
}

export class RecList implements Core {
  public constructor(public target: Core, public nil_type: V.Value, public core_nil: Core, public cons: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Nil(); } // TODO
}

export class IndList implements Core {
  public constructor(public target: Core, public motive: Core,
                     public base: Core, public step: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Nil(); } // TODO
}

export class Vec implements Core {
  public constructor(public e: Core, public ell: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Nil(); } // TODO
}

export class VecNil implements Core {
  public eval(_gamma: Context<V.Value>): V.Value { return new V.VecNil(); }
}

export class VecCons implements Core {
  public constructor(public head: Core, public tail: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.VecNil(); } // TODO
}

export class Head implements Core {
  public constructor(public vec: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.VecNil(); } // TODO
}

export class Tail implements Core {
  public constructor(public vec: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.VecNil(); } // TODO
}

export class U implements Core {
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); }
}

export class IndVec implements Core {
  public constructor(public ell: Core, public target: Core, public motive: Core,
                     public base: Core, public step: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class Equal implements Core {
  public constructor(public X: V.Value, public from: Core, public to: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class Same implements Core {
  public constructor(public mid: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class Symm implements Core {
  public constructor(public t: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class Cong implements Core {
  public constructor(public X: V.Value, public target: Core, public func: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class Replace implements Core {
  public constructor(public target: Core, public motive: Core, public base: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class Trans implements Core {
  public constructor(public left: Core, public right: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class IndEqual implements Core {
  public constructor(public target: Core, public motive: Core, public base: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class Either implements Core {
  public constructor(public left: Core, public right: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class Left implements Core {
  public constructor(public value: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class Right implements Core {
  public constructor(public value: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class IndEither implements Core {
  public constructor(public target: Core, public motive: Core,
                     public left: Core, public right: Core) { }

  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class Trivial implements Core {
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Trivial() }
}

export class Sole implements Core {
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Sole() }
}

export class Absurd implements Core {
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Absurd() }
}

export class IndAbsurd implements Core {
  public constructor(public target: Core, public motive: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Absurd() } // TODO
}
