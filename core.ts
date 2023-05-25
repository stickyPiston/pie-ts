import * as V from "./value.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";

type Symbol = string;
type Renaming = I.Map<Symbol, Symbol>;

export abstract class Core {
  public eval(_gamma: V.Rho): V.Value {
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
    public override eval(_gamma: V.Rho): V.Value {
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

export class Sigma extends Core {
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

export class List extends Core {
  public constructor(public e: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_e = this.e.eval(gamma);
      return new V.List(eval_e);
  }
}

export class Nil extends Core {
  public override eval(_gamma: V.Rho): V.Value {
      return new V.Nil();
  }
}

export class ListCons extends Core {
  public constructor(public head: Core, public tail: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_head = this.head.eval(gamma);
      const eval_tail = this.tail.eval(gamma);
      return new V.ListCons(eval_head, eval_tail);
  }
}

export class RecList extends Core {
  public constructor(public target: Core, public nil_type: V.Value,
                     public core_nil: Core, public cons: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_target = this.target.eval(gamma);
      const eval_base = this.core_nil.eval(gamma);
      const eval_step = this.cons.eval(gamma);
      return RecList.do(eval_target, eval_base, eval_step);
  }

  public static do(target: V.ListCons | V.Nil, base: V.Value, step: V.Value): V.Value {
      if (target instanceof V.Nil) {
          return base;
      } else {
          return V.apply_many(step,
            target.head, target.tail,
            RecList.do(target.tail, base, step));
      }
  }
}

export class IndList extends Core {
  public constructor(public target: Core, public motive: Core,
                     public base: Core, public step: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_target = this.target.eval(gamma);
      const eval_base = this.base.eval(gamma);
      const eval_step = this.step.eval(gamma);
      return RecList.do(eval_target, eval_base, eval_step);
  }
}

export class Vec extends Core {
  public constructor(public e: Core, public ell: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_e = this.e.eval(gamma);
      const eval_ell = this.ell.eval(gamma);
      return new V.Vec(eval_e, eval_ell);
  }
}

export class VecNil extends Core {
  public override eval(_gamma: V.Rho): V.Value {
      return new V.VecNil();
  }
}

export class VecCons extends Core {
  public constructor(public head: Core, public tail: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_head = this.head.eval(gamma);
      const eval_tail = this.tail.eval(gamma);
      return new V.VecCons(eval_head, eval_tail);
  }
}

export class Head extends Core {
  public constructor(public vec: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_vec = this.vec.eval(gamma) as V.VecCons;
      return eval_vec.head;
  }
}

export class Tail extends Core {
  public constructor(public vec: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_vec = this.vec.eval(gamma) as V.VecCons;
      return eval_vec.tail;
  }
}

export class U extends Core {
  public override eval(_gamma: V.Rho): V.Value {
      return new V.U();
  }
}

export class IndVec extends Core {
  public constructor(public ell: Core, public target: Core, public motive: Core,
                     public base: Core, public step: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_ell = this.ell.eval(gamma);
      const eval_target = this.target.eval(gamma);
      const eval_base = this.base.eval(gamma);
      const eval_step = this.step.eval(gamma);
      return IndVec.do(eval_ell, eval_target, eval_base, eval_step);
  }

  public static do(ell: V.Add1 | V.Zero, target: V.VecCons | V.VecNil,
                   base: V.Value, step: V.Value): V.Value {
    // Technically the target check is not necessary, but typescript requires
    // it to allow accessing members of target
    if (ell instanceof V.Add1 && target instanceof V.VecCons) {
        return V.apply_many(step, ell, target.head, target.tail,
                            IndVec.do(ell.n, target.tail, base, step));
    } else {
        return base;
    }
  }
}

export class Equal extends Core {
  public constructor(public X: V.Value, public from: Core, public to: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_from = this.from.eval(gamma);
      const eval_to = this.to.eval(gamma);
      return new V.Equal(this.X, eval_from, eval_to);
  }
}

export class Same extends Core {
  public constructor(public mid: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      return new V.Same(this.mid.eval(gamma));
  }
}

export class Symm extends Core {
  public constructor(public t: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      return this.t.eval(gamma);
  }
}

export class Cong extends Core {
  public constructor(public X: V.Value, public target: Core, public func: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_target = this.target.eval(gamma) as V.Same;
      const eval_func = this.func.eval(gamma);
      return new V.Same(V.apply_many(eval_func, eval_target));
  }
}

export class Replace extends Core {
  public constructor(public target: Core, public motive: Core, public base: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      return this.base.eval(gamma);
  }
}

export class Trans extends Core {
  public constructor(public left: Core, public right: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      return this.left.eval(gamma);
  }
}

export class IndEqual extends Core {
  public constructor(public target: Core, public motive: Core, public base: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      return this.base.eval(gamma);
  }
}

export class Either extends Core {
  public constructor(public left: Core, public right: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_left = this.left.eval(gamma);
      const eval_right = this.right.eval(gamma);
      return new V.Either(eval_left, eval_right);
  }
}

export class Left extends Core {
  public constructor(public value: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      return new V.Left(this.value.eval(gamma));
  }
}

export class Right extends Core {
  public constructor(public value: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      return new V.Right(this.value.eval(gamma));
  }
}

export class IndEither extends Core {
  public constructor(public target: Core, public motive: Core,
                     public left: Core, public right: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_target = this.target.eval(gamma);
      if (eval_target instanceof V.Left) {
          return V.apply_many(this.left.eval(gamma), eval_target);
      } else {
          return V.apply_many(this.right.eval(gamma), eval_target);
      }
  }
}

export class Trivial extends Core {
  public override eval(_gamma: V.Rho): V.Value {
      return new V.Trivial()
  }
}

export class Sole extends Core {
  public override eval(_gamma: V.Rho): V.Value {
      return new V.Sole();
  }
}

export class Absurd extends Core {
  public override eval(_gamma: V.Rho): V.Value {
      return new V.Absurd();
  }
}

export class IndAbsurd extends Core {
  public constructor(public target: Core, public motive: Core) { super(); }
  public override eval(_gamma: V.Rho): V.Value {
      return new V.Absurd()
  } // TODO
}
