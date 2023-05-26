import * as V from "./value.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";
import * as N from "./neutral.ts";

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
        return Car.do(this.pair.eval(gamma) as V.Cons | V.Neutral);
    }

  public static do(pair: V.Cons | V.Neutral): V.Value {
      if (pair instanceof V.Neutral) {
          return new V.Neutral(
              (pair.type as V.Sigma).value,
              new N.Car(pair.neutral));
      } else {
          return pair.fst;
      }
  }
}

export class Cdr extends Core {
  public constructor(public pair: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_pair = this.pair.eval(gamma) as V.Cons | V.Neutral;
      if (eval_pair instanceof V.Neutral) {
          const sigma = eval_pair.type as V.Sigma;
          return new V.Neutral(
              sigma.body.instantiate(sigma.name, Car.do(eval_pair)),
              new N.Car(eval_pair.neutral));
      } else {
          return eval_pair.snd;
      }
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
      return Appl.do(
          this.func.eval(gamma) as V.Lambda | V.Neutral,
          this.arg.eval(gamma));
  }

  public static do(func: V.Lambda | V.Neutral, arg: V.Value): V.Value {
      if (func instanceof V.Lambda) {
          return V.apply_many(func, arg);
      } else {
          const pi = func.type as V.Pi;
          return new V.Neutral(
            pi.body.instantiate(pi.name, arg),
            new N.Appl(func.neutral, new N.Normal(arg, pi.value)));
      }
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

function to_bound(gamma: V.Rho): V.Bound {
    return gamma.keySeq().toList();
}

export class WhichNat extends Core {
  public constructor(public target: Core, public base_type: V.Value,
                     public base_expr: Core, public add1: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const target = this.target.eval(gamma);
      const base = this.base_expr.eval(gamma);
      const step = this.add1.eval(gamma);
      if (target instanceof V.Neutral) {
          const ty_name = V.fresh(to_bound(gamma), "ty");
          const pi_type = new Pi("n", new Nat(), new Var(ty_name));
          const env = I.Map({ [ty_name]: this.base_type });
          return new V.Neutral(
              this.base_type,
              new N.WhichNat(target.neutral,
                  new N.Normal(base, this.base_type),
                  new N.Normal(step, pi_type.eval(env))));
      } else if (target instanceof V.Zero) {
          return base;
      } else {
          return step;
      }
  }
}

export class IterNat extends Core {
  public constructor(public target: Core, public base_type: V.Value,
                     public base_expr: Core, public add1: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_target = this.target.eval(gamma);
      return this.do(gamma, eval_target, this.base_expr.eval(gamma), this.add1.eval(gamma));
  }

  public do(gamma: V.Rho, n: V.Zero | V.Add1 | V.Neutral, base: V.Value, step: V.Value): V.Value {
      if (n instanceof V.Neutral) {
          const ty_name = V.fresh(to_bound(gamma), "ty");
          const pi_type = new Pi("x", new Var(ty_name), new Var(ty_name));
          const env = I.Map({ [ty_name]: this.base_type });
          return new V.Neutral(
            this.base_type,
            new N.IterNat(
                n.neutral,
                new N.Normal(base, this.base_type),
                new N.Normal(step, pi_type.eval(env))));
      } else if (n instanceof V.Zero) {
          return base;
      } else {
          return V.apply_many(step, this.do(gamma, n.n, base, step)); 
      }
  }
}

export class RecNat extends Core {
  public constructor(public target: Core, public base_type: V.Value,
                     public base: Core, public add1: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      const eval_target = this.target.eval(gamma);
      return this.do(gamma, eval_target, this.base.eval(gamma), this.add1.eval(gamma));
  }

  public do(gamma: V.Rho, n: V.Add1 | V.Zero | V.Neutral, base: V.Value, step: V.Value): V.Value {
      if (n instanceof V.Neutral) {
          const ty_name = V.fresh(to_bound(gamma), "ty");
          const pi_type = new Pi("n", new Nat(),
              new Pi("x", new Var(ty_name), new Var(ty_name)));
          const env = I.Map({ [ty_name]: this.base_type });
          return new V.Neutral(
            this.base_type,
            new N.RecNat(
                n.neutral,
                new N.Normal(base, this.base_type),
                new N.Normal(step, pi_type.eval(env))));
      } else if (n instanceof V.Zero) {
          return base;
      } else {
          return V.apply_many(step, n.n, this.do(gamma, n.n, base, step));
      }
  }
}

export class IndNat extends Core {
  public constructor(public target: Core, public motive: Core,
                     public base_expr: Core, public add1: Core) { super(); }
  public override eval(gamma: V.Rho): V.Value {
      return this.do(gamma, this.target.eval(gamma), this.motive.eval(gamma),
                     this.base_expr.eval(gamma), this.add1.eval(gamma));
  }

  public do(gamma: V.Rho, n: V.Add1 | V.Zero | V.Neutral, motive: V.Value,
            base: V.Value, step: V.Value): V.Value {
      if (n instanceof V.Neutral) {
          const n_name = V.fresh(to_bound(gamma), "n");
          const mot_name = V.fresh(to_bound(gamma), "mot");
          const step_type = new Pi(n_name, new Nat(),
              new Pi("x", new Appl(new Var(mot_name), new Var(n_name)),
                new Appl(new Var(mot_name), new Add1(new Var(n_name)))));
          const env = I.Map({ [mot_name]: motive });
          const mot_type = new V.Pi("n", new V.Nat(), new V.Closure(gamma, new U()));
          return new V.Neutral(
              V.apply_many(motive, n),
            new N.IndNat(
                n.neutral,
                new N.Normal(motive, mot_type),
                new N.Normal(base, V.apply_many(motive, new V.Zero())),
                new N.Normal(step, step_type.eval(env))));
      } else if (n instanceof V.Zero) {
          return base;
      } else {
          return V.apply_many(step, n.n, this.do(gamma, n.n, motive, base, step));
      }
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
      return this.do(gamma, eval_target, eval_base, eval_step);
  }

  public do(gamma: V.Rho, target: V.ListCons | V.Nil | V.Neutral,
            base: V.Value, step: V.Value): V.Value {
      if (target instanceof V.Neutral) {
          const list_type = target.type as V.List;
          const E = V.fresh(to_bound(gamma), "E");
          const X = V.fresh(to_bound(gamma), "X");
          const step_type = new Pi("head", new Var(E),
              new Pi("tail", new List(new Var(E)),
                  new Pi("so-far", new Var(X), new Var(X))));
          const env = I.Map({ [E]: list_type.e, [X]: this.nil_type });
          return new V.Neutral(
            this.nil_type,
            new N.RecList(
                target.neutral,
                new N.Normal(base, this.nil_type),
                new N.Normal(step, step_type.eval(env))));
      } else if (target instanceof V.Nil) {
          return base;
      } else {
          return V.apply_many(step,
            target.head, target.tail,
            this.do(gamma, target.tail, base, step));
      }
  }
}

export class IndList extends Core {
  public constructor(public target: Core, public motive: Core,
                     public base: Core, public step: Core) { super(); }

  public override eval(gamma: V.Rho): V.Value {
      const eval_target = this.target.eval(gamma);
      const eval_motive = this.motive.eval(gamma);
      const eval_base = this.base.eval(gamma);
      const eval_step = this.step.eval(gamma);
      return this.do(gamma, eval_target, eval_motive, eval_base, eval_step);
  }

  public do(gamma: V.Rho, target: V.ListCons | V.Nil | V.Neutral,
            motive: V.Value, base: V.Value, step: V.Value): V.Value {
      if (target instanceof V.Neutral) {
          const list_type = target.type as V.List;
          const E = V.fresh(to_bound(gamma), "E");
          const mot = V.fresh(to_bound(gamma), "mot");
          const step_type = new Pi("e", new Var(E),
              new Pi("es", new List(new Var(E)),
                  new Pi("so-far", new Appl(new Var(mot), new Var("es")),
                      new Appl(new Var(mot), new ListCons(new Var("e"), new Var("es"))))));
          const mot_type = new Pi("list", new List(new Var(E)), new U());
          const env = I.Map({ [E]: list_type.e, [mot]: motive });
          return new V.Neutral(
              V.apply_many(motive, target),
            new N.IndList(
                target.neutral,
                new N.Normal(motive, mot_type.eval(env)),
                new N.Normal(base, V.apply_many(motive, new V.Nil())),
                new N.Normal(step, step_type.eval(env))));
      } else if (target instanceof V.Nil) {
          return base;
      } else {
          return V.apply_many(step,
            target.head, target.tail,
            this.do(gamma, target.tail, motive, base, step));
      }
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

export class IndVec extends Core {
  public constructor(public ell: Core, public target: Core, public motive: Core,
                     public base: Core, public step: Core) { super(); }

  public override eval(gamma: V.Rho): V.Value {
      const eval_ell = this.ell.eval(gamma);
      const eval_target = this.target.eval(gamma);
      const eval_motive = this.motive.eval(gamma);
      const eval_base = this.base.eval(gamma);
      const eval_step = this.step.eval(gamma);
      return this.do(gamma, eval_ell, eval_target, eval_motive, eval_base, eval_step);
  }

  public do(gamma: V.Rho, ell: V.Add1 | V.Zero | V.Neutral,
                   target: V.VecCons | V.VecNil | V.Neutral, motive: V.Value,
                   base: V.Value, step: V.Value): V.Value {
    // Technically the target check is not necessary, but typescript requires
    // it to allow accessing members of target
    if (ell instanceof V.Add1 && target instanceof V.VecCons) {
        return V.apply_many(step, ell, target.head, target.tail,
                            this.do(gamma, ell.n, target.tail, motive, base, step));
    } else {
        return base;
    }
  }
}

export class U extends Core {
  public override eval(_gamma: V.Rho): V.Value {
      return new V.U();
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
