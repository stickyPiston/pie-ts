import * as C from "./core.ts";
import * as V from "./value.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";

type Symbol = string;
type SynthResult = { type: V.Value, expr: C.Core };
type Context = I.Map<Symbol, SynthResult>;

function fresh(context: Context, name: Symbol, attempt: number | undefined = undefined): Symbol {
  if (context.has(name)) {
    return fresh(context, name, attempt ? attempt + 1 : 2);
  } else {
    return attempt ? name + attempt : name;
  }
}

export abstract class Expr {
  abstract description: string;

  public synth(_context: Context): SynthResult {
    throw new Error(`Could not synthesize type for ${this.description}.`);
  }

  public isType(context: Context): C.Core {
    return this.check(context, new V.U());
  }

  public check(context: Context, against: V.Value): C.Core {
    const { type, expr } = this.synth(context);
    against.same_type(type);
    return expr;
  }
}

export class The extends Expr {
  public description = "The expression";
  public constructor(public type: Expr, public value: Expr) { super(); }

  public override synth(context: Context): SynthResult {
    const type_core  = this.type.isType(context);
    const type_value = type_core.normalise();
    const value_core = this.value.check(context, type_value);
    return { type: type_value, expr: value_core };
  }
}

export class Var extends Expr {
  public description = "Variable";
  public constructor(public name: Symbol) { super(); }

  public override synth(context: Context): SynthResult {
    const type = context.get(this.name);
    if (type) {
      return type;
    } else {
      throw new Error(`Cannot find undeclared symbol ${this.name}`);
    }
  }
}

// Atoms

export class Atom extends Expr {
  public description = "Atom type";

  public override synth(_context: Context): SynthResult {
    return { type: new V.U(), expr: new C.Atom() };
  }

  public override isType(_context: Context): C.Core {
    return new C.Atom();
  }
}

export class Tick extends Expr {
  public description = "Tick expression";
  public constructor(public name: Symbol) { super(); }

  public override synth(_context: Context): SynthResult {
    return { type: new V.Atom(), expr: new C.Tick(this.name) };
  }
}

// Pairs

export class Pair extends Expr {
  public description = "Pair type";
  public constructor(public left: Expr, public right: Expr) { super(); }

  public override isType(context: Context): C.Core {
    const core_A = this.left.isType(context);
    const fresh_x = fresh(context, "x");
    const new_gamma = context.set(fresh_x, core_A.normalise());
    const core_body = this.right.isType(new_gamma);
    return new C.Sigma(fresh_x, core_A, core_body);
  }

  public override synth(context: Context): SynthResult {
    const core_A = this.left.check(context, new V.U());
    const core_D = this.right.check(context, new V.U());
    return { type: new V.U(), expr: new C.Sigma(fresh(context, "x"), core_A, core_D) };
  }
}

export class Sigma extends Expr {
  public description = "Sigma expression";
  public constructor(public params: { name: Symbol, value: Expr }[], public base: Expr) { super(); }

  public override synth(context: Context): SynthResult {
    const core = this.isType(context);
    return { type: new V.U(), expr: core };
  }

  public override isType(context: Context): C.Core {
    const [A, ...rest] = this.params;
    const core_A = A.value.isType(context);
    const new_gamma = context.set(A.name, core_A.normalise());
    if (rest.length) {
      const smaller = new Sigma(rest, this.base);
      const core_smaller = smaller.isType(new_gamma);
      return new C.Sigma(A.name, core_A, core_smaller);
    } else {
      const core_base = this.base.isType(new_gamma);
      return new C.Sigma(A.name, core_A, core_base);
    }
  }
}

export class Cons extends Expr {
  public description = "Cons expression";
  public constructor(public left: Expr, public right: Expr) { super(); }

  public override check(context: Context, against: V.Value): C.Core {
    if (against instanceof V.Sigma) {
      const { name, value: A, body: D } = against;
      const core_left  = this.left.check(context, A);
      const replaced_D = D.instantiate(name, core_left.normalise());
      const core_right = this.right.check(context, replaced_D);
      return new C.Cons(core_left, core_right);
    } else {
      throw new Error(`Cons expression cannot be of type ${against.description}`);
    }
  }
}

export class Car extends Expr {
  public description = "Car expression";
  public constructor(public pair: Expr) { super(); }

  public override synth(context: Context): SynthResult {
    const { type, expr: core } = this.pair.synth(context);
    if (type instanceof V.Sigma) {
      return { type: type.value, expr: new C.Car(core) };
    } else {
      throw new Error(`Expected a Sigma type as argument to car, got ${type.description}`);
    }
  }
}

export class Cdr extends Expr {
  public description = "Cdr expression";
  public constructor(public pair: Expr) { super(); }

  public override synth(context: Context): SynthResult {
    const { type, expr: core } = this.pair.synth(context);
    if (type instanceof V.Sigma) {
      return { type: type.value, expr: new C.Cdr(core) };
    } else {
      throw new Error(`Expected a Sigma type as argument to cdr, got ${type.description}`);
    }
  }
}

// Functions

export class Arrow extends Expr {
  public description = "Arrow expression";
  public constructor(public args: Expr[]) { super(); }

  public override isType(context: Context): C.Core {
    const [from, to, ...rest] = this.args;
    const core_from = from.isType(context);
    const fresh_x = fresh(context, "x");
    if (rest.length) {
      const smaller = new Arrow([to, ...rest]);
      const new_gamma = context.set(fresh_x, core_from.normalise());
      const core_smaller = smaller.isType(new_gamma);
      return new C.Pi(fresh_x, core_from, core_smaller);
    } else if (to) {
      const core_to = to.isType(context);
      return new C.Pi(fresh_x, core_from, core_to);
    } else {
      throw new Error("Expected at least two arguments to ->");
    }
  }

  public override synth(context: Context): SynthResult {
    const [from, to, ...rest] = this.args;
    const core_X = from.check(context, new V.U());
    const var_x = fresh(context, "x");
    const new_gamma = context.set(var_x, core_X.normalise());
    if (rest.length) {
      const core_R = new Arrow(rest).check(new_gamma, new V.U());
      return {
        type: new V.U(),
        expr: new C.Pi(var_x, core_X, core_R)
      };
    } else {
      const core_R = to.check(new_gamma, new V.U());
      return {
        type: new V.U(),
        expr: new C.Pi(var_x, core_X, core_R)
      };
    }
  }
}

export class Pi extends Expr {
  public description = "Pi expression";
  public constructor(public params: { name: Symbol, value: Expr }[], public base: Expr) { super(); }

  public override isType(context: Context): C.Core {
    const [arg, ...rest] = this.params;
    const core_arg = arg.value.isType(context);
    const new_gamma = context.set(arg.name, core_arg.normalise());
    if (rest.length) {
      const smaller = new Pi(rest, this.base);
      const core_smaller = smaller.isType(new_gamma);
      return new C.Pi(arg.name, core_arg, core_smaller);
    } else {
      const core_base = this.base.isType(new_gamma);
      return new C.Pi(arg.name, core_arg, core_base);
    }
  }

  public override synth(context: Context): SynthResult {
    const [param, ...rest] = this.params;
    const core_X = param.value.check(context, new V.U());
    const new_gamma = context.set(param.name, core_X.normalise());
    if (rest.length) {
      const core_R = new Pi(rest, this.base).check(new_gamma, new V.U());
      return { type: new V.U(), expr: new C.Pi(param.name, core_X, core_R) };
    } else {
      const core_R = this.base.check(new_gamma, new V.U());
      return { type: new V.U(), expr: new C.Pi(param.name, core_X, core_R) };
    }
  }
}

export class Lambda extends Expr {
  public description = "Lambda abstraction";
  public constructor(public params: Symbol[], public body: Expr) { super(); }

  public override check(context: Context, against: V.Value): C.Core {
    if (against instanceof V.Pi) {
      const { value, body } = against;
      const [param, ...rest] = this.params;
      const new_gamma = context.set(param, { type: new V.U(), expr: value.read_back() });
      if (rest.length) {
        const smaller = new Lambda(rest, this.body);
        const core_smaller = smaller.check(new_gamma, body);
        return new C.Lambda(param, core_smaller);
      } else {
        const core_R = this.body.check(new_gamma, body);
        return new C.Lambda(param, core_R);
      }
    } else {
      throw new Error(`Expected Pi type for lambda expression, got ${against.description}`);
    }
  }
}

export class Appl extends Expr {
  public description = "Function application";
  public constructor(public func: Expr, public args: Expr[]) { super(); }

  public override synth(context: Context): SynthResult {
    if (this.args.length > 1) {
      const args = this.args.slice(0, this.args.length - 1);
      const appl = new Appl(this.func, args);
      const { type, expr: core_appl } = appl.synth(context) as { type: V.Pi, expr: C.Core };

      const arg = this.args[this.args.length - 1];
      const core_arg = arg.check(context, type.value);

      return {
        type: type.body.instantiate(type.name, core_arg),
        expr: new C.Appl(core_appl, core_arg)
      };
    } else {
      const arg = this.args[0];
      const { type, expr: core_func } = this.func.synth(context) as { type: V.Pi, expr: C.Core };
      const core_arg = arg.check(context, type.value);

      return {
        type: type.body.instantiate(type.name, core_arg),
        expr: new C.Appl(core_func, core_arg)
      };
    }
  }
}

// Numbers

export class Nat extends Expr {
  public description = "Nat type";

  public override isType(_context: Context): C.Core {
    return new C.Nat();
  }

  public override synth(_context: Context): SynthResult {
    return { type: new V.U(), expr: new C.Nat() };
  }
}

export class Zero extends Expr {
  public description = "Zero expression";

  public override synth(_context: Context): SynthResult {
    return { type: new V.Nat(), expr: new C.Zero() };
  }
}

export class Add1 extends Expr {
  public description = "Add1 expression";
  public constructor(public num: Expr) { super(); }

  public override synth(context: Context): SynthResult {
    const core_num = this.num.check(context, new V.Nat());
    return { type: new V.Nat(), expr: new C.Add1(core_num) };
  }
}

export class NatLit extends Expr {
  public description = "Number literal";
  public constructor(public num: number) { super(); }

  public override synth(_context: Context): SynthResult {
    let core_num = new C.Zero();
    for (let n = 0; n < this.num; n++)
      core_num = new C.Add1(core_num);
    return { type: new V.Nat(), expr: core_num };
  }
}

export class WhichNat extends Expr {
  public description = "which-Nat expression";
  public constructor(public target: Expr, public zero: Expr, public add1: Expr) { super(); }

  public override synth(context: Context): SynthResult {
    const core_t = this.target.check(context, new V.Nat());
    const { type, expr: core_b } = this.zero.synth(context);
    const fn_type = new V.Pi(fresh(context, "x"), new V.Nat(), type);
    const core_s = this.add1.check(context, fn_type);
    return { type, expr: new C.WhichNat(core_t, type, core_b, core_s) };
  }
}

export class IterNat extends Expr {
  public description = "iter-Nat expression";
  public constructor(public target: Expr, public zero: Expr, public add1: Expr) { super(); }

  public override synth(context: Context): SynthResult {
    const core_t = this.target.check(context, new V.Nat());
    const { type, expr: core_b } = this.zero.synth(context);
    const fn_type = new V.Pi(fresh(context, "x"), type, type);
    const core_s = this.add1.check(context, fn_type);
    return { type, expr: new C.IterNat(core_t, type, core_b, core_s) };
  }
}

export class RecNat extends Expr {
  public description = "rec-Nat expression";
  public constructor(public target: Expr, public zero: Expr, public add1: Expr) { super(); }

  public override synth(context: Context): SynthResult {
    const core_t = this.target.check(context, new V.Nat());
    const { type, expr: core_b } = this.zero.synth(context);
    const inner_fn = new V.Pi(fresh(context, "x"), type, type);
    const fn_type = new V.Pi(fresh(context, "n"), new V.Nat(), inner_fn);
    const core_s = this.add1.check(context, fn_type);
    return { type, expr: new C.RecNat(core_t, type, core_b, core_s) };
  }
}

function apply_core_many(func: C.Core, ...args: C.Core[]): V.Value {
  const [head, ...tail] = args;
  let result = new C.Appl(func, head);
  for (const arg of tail)
    result = new C.Appl(result, arg);
  return result.normalise();
}

function to_rho(context: Context): I.Map<Symbol, V.Value> {
  return context.map(entry => entry.expr.normalise());
}

function create_pi_many(context: Context, head: { name: Symbol, value: V.Value }, params: { name: Symbol, value: C.Core }[], ret: C.Core): V.Value {
  const inner = params.reduceRight((acc: C.Core, { name, value }) =>
                                   new C.Pi(name, value, acc), ret);
  return new V.Pi(head.name, head.value, new C.Closure(to_rho(context), inner));
}

export class IndNat extends Expr {
  public description = "ind-Nat expression";
  public constructor(public target: Expr, public motive: Expr,
                     public zero: Expr, public add1: Expr) { super(); }

  public override synth(context: Context): SynthResult {
    const core_t = this.target.check(context, new V.Nat());
    const motive_type = new V.Pi(fresh(context, "x"), new V.Nat(), new V.U());
    const core_m = this.motive.check(context, motive_type);
    const base_type = apply_core_many(core_m, new C.Zero());
    const core_b = this.zero.check(context, base_type);

    const n_name = fresh(context, "n");
    const step_type = create_pi_many(
      context,
      { name: n_name, value: new V.Nat() },
      [
        { name: fresh(context, "almost"), value: new C.Appl(core_m, new C.Var(n_name)) }
      ],
      new C.Appl(core_m, new C.Add1(new C.Var(n_name))),
    )
    const core_s = this.add1.check(context, step_type);

    return {
      type: apply_core_many(core_m, core_t),
      expr: new C.IndNat(core_t, core_m, core_b, core_s)
    };
  }
}

// Lists

export class List extends Expr {
  public description = "List type";
  public constructor(public e: Expr) { super(); }

  public override isType(context: Context): C.Core {
    const core_e = this.e.isType(context);
    return new C.List(core_e);
  }

  public override synth(context: Context): SynthResult {
    const core_E = this.e.check(context, new V.U());
    return { type: new V.U(), expr: new C.List(core_E) };
  }
}

export class Nil extends Expr {
  public description = "List nil";

  public override check(_context: Context, against: V.Value): C.Core {
    if (against instanceof V.List) {
      return new C.Nil();
    } else {
      throw new Error(`Expected nil to be list type, got ${against.description}`);
    }
  }
}

export class ListCons extends Expr {
  public description = "List cons expression";
  public constructor(public head: Expr, public tail: Expr) { super(); }

  public override synth(context: Context): SynthResult {
    const { type, expr: core_head } = this.head.synth(context);
    const core_tail = this.tail.check(context, new V.List(type));
    return { type: new V.List(type), expr: new C.ListCons(core_head, core_tail) };
  }
}

export class RecList extends Expr {
  public description = "rec-List expression";
  public constructor(public target: Expr, public nil: Expr, public cons: Expr) { super(); }

  public override synth(context: Context): SynthResult {
    const { type: type_t, expr: core_t } = this.target.synth(context);
    if (type_t instanceof V.List) {
      const { type: type_b, expr: core_b } = this.nil.synth(context);

      const step_type = create_pi_many(
        context,
        { name: fresh(context, "x"), value: type_t.e },
        [
          { name: fresh(context, "xs"), value: type_t.read_back() },
          { name: fresh(context, "almost"), value: type_b.read_back() }
        ],
        type_b.read_back()
      );
      const core_s = this.cons.check(context, step_type);

      return {
        type: type_b,
        expr: new C.RecList(core_t, type_b, core_b, core_s)
      };
    } else {
      throw new Error(`Expected t in (rec-List t b s) to be of type (List E), got ${type_t.description}`);
    }
  }
}

export class IndList extends Expr {
  public description = "ind-List expression";
  public constructor(public target: Expr, public motive: Expr,
                     public nil: Expr, public cons: Expr) { super(); }

  public override synth(context: Context): SynthResult {
    const { type: type_t, expr: core_t } = this.target.synth(context);
    if (type_t instanceof V.List) {
      const motive_type = create_pi_many(
        context,
        { name: fresh(context, "xs"), value: type_t },
        [],
        new C.U(),
      );
      const core_m = this.motive.check(context, motive_type);

      const core_b = this.nil.check(context, apply_core_many(core_m, new C.Nil()));

      const var_x = fresh(context, "x"), var_xs = fresh(context, "xs");
      const step_type = create_pi_many(
        context,
        { name: var_x, value: type_t.e },
        [
          { name: var_xs, value: type_t.read_back() },
          { name: fresh(context, "almost"), value: new C.Appl(core_m, new C.Var(var_xs)) }
        ],
        new C.Appl(core_m, new C.ListCons(new C.Var(var_x), new C.Var(var_xs))),
      );
      const core_s = this.cons.check(context, step_type);

      return {
        type: apply_core_many(core_m, core_t),
        expr: new C.IndList(core_t, core_m, core_b, core_s)
      };
    } else {
      throw new Error(`Expected t in (ind-Nat t m b s) to be of type (List E), got ${type_t.description}`);
    }
  }
}

// Vectors

export class Vec extends Expr {
  public description = "Vec type";
  public constructor(public e: Expr, public ell: Expr) { super(); }

  public override isType(context: Context): C.Core {
    const core_e = this.e.isType(context);
    const core_ell = this.ell.check(context, new V.Nat());
    return new C.Vec(core_e, core_ell);
  }

  public override synth(context: Context): SynthResult {
    const core_E = this.e.check(context, new V.U());
    const core_ell = this.ell.check(context, new V.Nat());
    return { type: new V.U(), expr: new C.Vec(core_E, core_ell) };
  }
}

export class VecNil extends Expr {
  public description = "vecnil expression";

  public override check(_context: Context, against: V.Value): C.Core {
    if (against instanceof V.Vec) {
      return new C.VecNil();
    } else {
      throw new Error(`Expected vecnil to be vec type, got ${against.description}`);
    }
  }
}

export class VecCons extends Expr {
  public description = "vec:: expression";
  public constructor(public head: Expr, public tail: Expr) { super(); }

  public override check(context: Context, against: V.Value): C.Core {
    if (against instanceof V.Vec && against.ell instanceof V.Add1) {
      const { e, ell } = against;
      const core_e = this.head.check(context, e);
      const core_es = this.tail.check(context, new V.Vec(e, ell.n));
      return new C.VecCons(core_e, core_es);
    } else {
      throw new Error(`Expected vec:: to be (Vec E (add1 ell)) type, got ${against.description}`);
    }
  }
}

export class Head extends Expr {
  public description = "head expression";
  public constructor(public vec: Expr) { super(); }

  public override synth(context: Context): SynthResult {
    const { type, expr } = this.vec.synth(context);
    if (type instanceof V.Vec && type.ell instanceof V.Add1) {
      return { type: type.e, expr: new C.Head(expr) };
    } else {
      throw new Error(`Expected t in (head t) to be of type (Vec E (add1 ell)), got ${type.description}`);
    }
  }
}

export class Tail extends Expr {
  public description = "tail expression";
  public constructor(public vec: Expr) { super(); }

  public override synth(context: Context): SynthResult {
    const { type, expr } = this.vec.synth(context);
    if (type instanceof V.Vec && type.ell instanceof V.Add1) {
      return { type: new V.Vec(type.e, type.ell.n), expr: new C.Tail(expr) };
    } else {
      throw new Error(`Expected t in (tail t) to be of type (Vec E (add1 ell)), got ${type.description}`);
    }
  }
}

export class IndVec extends Expr {
  public description = "ind-Vec expression";
  public constructor(public ell: Expr, public target: Expr, public motive: Expr,
                     public nil: Expr, public cons: Expr) { super(); }

  public override synth(context: Context): SynthResult {
    const core_ell = this.ell.check(context, new V.Nat());
    const value_ell = core_ell.normalise();
    const { type: type_t, expr: core_t } = this.target.synth(context);
    if (type_t instanceof V.Vec && type_t.ell.same_value(new V.Nat(), value_ell)) {
      const var_k = fresh(context, "k");
      const motive_type = create_pi_many(
        context,
        { name: var_k, value: new V.Nat() },
        [{ name: fresh(context, "es"), value: new C.Vec(type_t.e.read_back(), new C.Var(var_k)) }],
        new C.U(),
      );
      const core_m = this.motive.check(context, motive_type);

      const base_type = apply_core_many(core_m, new C.Zero(), new C.VecNil());
      const core_b = this.nil.check(context, base_type);

      const var_e = fresh(context, "e"), var_es = fresh(context, "es");
      const step_type = create_pi_many(
        context,
        { name: var_k, value: new V.Nat() },
        [
          { name: var_e, value: type_t.e.read_back() },
          { name: var_es, value: new C.Vec(type_t.e.read_back(), new C.Var(var_k)) },
          {
            name: fresh(context, "almost"),
            value: new C.Appl(new C.Appl(core_m, new C.Var(var_k)), new C.Var(var_es))
          }
        ],
        new C.Appl(
          new C.Appl(core_m, new C.Add1(new C.Var(var_k))),
          new C.VecCons(new C.Var(var_e), new C.Var(var_es))
        )
      );
      const core_s = this.cons.check(context, step_type);

      return {
        type: apply_core_many(core_m, core_ell, core_t),
        expr: new C.IndVec(core_ell, core_t, core_m, core_b, core_s)
      };
    } else {
      throw new Error(`Expected t in (ind-Vec ell t m b s) to be (Vec E ${value_ell}), got ${type_t}`);
    }
  }
}

// Equalities

export class Equal extends Expr {
  public description = "= type";
  public constructor(public type: Expr, public left: Expr, public right: Expr) { super(); }

  public override isType(context: Context): C.Core {
    const core_X = this.type.isType(context);
    const value_X = core_X.normalise();
    const core_from = this.left.check(context, value_X);
    const core_to = this.right.check(context, value_X);

    return new C.Equal(value_X, core_from, core_to);
  }

  public override synth(context: Context): SynthResult {
    const core_X = this.type.check(context, new V.U());
    const value_X = core_X.normalise();
    const core_from = this.left.check(context, value_X);
    const core_to = this.right.check(context, value_X);
    return { type: new V.U(), expr: new C.Equal(value_X, core_from, core_to); };
  }
}

export class Same extends Expr {
  public description = "same expression";
  public constructor(public thing: Expr) { super(); }

  public override check(context: Context, against: V.Value): C.Core {
    if (against instanceof V.Equal) {
      const core_mid = this.thing.check(context, against.X);
      const value_mid = core_mid.normalise();
      against.from.same_value(against.X, value_mid);
      against.to.same_value(against.X, value_mid);

      return new C.Same(core_mid);
    } else {
      throw new Error(`Expected (same mid) to be of type (= from to), got ${against.description}`);
    }
  }
}

export class Symm extends Expr {
  public description = "symm expression";
  public constructor(public equal: Expr) { super(); }

  public override synth(context: Context): SynthResult {
    const core_t = this.equal.synth(context);
    if (core_t.type instanceof V.Equal) {
      const { X, from, to } = core_t.type;
      return {
        type: new V.Equal(X, to, from),
        expr: new C.Symm(core_t.expr)
      };
    } else {
      throw new Error(`Expected t in (symm t) to be of type (= from to), got ${core_t.type.description}`);
    }
  }
}

export class Cong extends Expr {
  public description = "cong expression";
  public constructor(public target: Expr, public func: Expr) { super(); }

  public override synth(context: Context): SynthResult {
    const { type: type_t, expr: core_t } = this.target.synth(context);
    if (type_t instanceof V.Equal) {
      const { type: type_f, expr: core_f } = this.func.synth(context);
      if (type_f instanceof V.Pi) {
        type_t.same_type(type_f.value);
        const value_f = core_f.normalise();
        return {
          type: new V.Equal(type_f.body, V.apply_many(value_f, type_t.from), V.apply_many(value_f, type_t.to)),
          expr: new C.Cong(type_t.X, core_t, core_f)
        };
      } else {
        throw new Error(`Expected f in (cong t f) to be of type (Pi ((x X)) Y), got ${type_f.description}`);
      }
    } else {
      throw new Error(`Expected t in (cong t f) to be of type (= from to), got ${type_t.description}`);
    }
  }
}

export class Replace extends Expr {
  public description = "replace expression";
  public constructor(public target: Expr, public motive: Expr, public base: Expr) { super(); }
  
  public override synth(context: Context): SynthResult {
    const { type, expr: core_t } = this.target.synth(context);
    if (type instanceof V.Equal) {
      const motive_type = new V.Pi(fresh(context, "x"), type.X, new V.U());
      const core_m = this.motive.check(context, motive_type);
      const value_m = core_m.normalise();
      const core_b = this.base.check(context, V.apply_many(value_m, type.from));
      return {
        type: V.apply_many(value_m, type.to),
        expr: new C.Replace(core_t, core_m, core_b)
      };
    } else {
      throw new Error(`Expected t in (replace t m b) to be of type (= from to), got ${type.description}`);
    }
  }
}

export class Trans extends Expr {
  public description = "trans expression";
  public constructor(public left: Expr, public right: Expr) { super(); }

  public override synth(context: Context): SynthResult {
    const { type: type_left, expr: core_left } = this.left.synth(context);
    if (type_left instanceof V.Equal) {
      const { type: type_right, expr: core_right } = this.right.synth(context);
      if (type_right instanceof V.Equal) {
        type_left.X.same_type(type_right.X);
        type_left.to.same_value(type_left.X, type_right.from);
        return {
          type: new V.Equal(type_left.X, type_left.from, type_right.to),
          expr: new C.Trans(core_left, core_right)
        };
      } else {
        throw new Error(`Expected rt in (trans lt rt) to be of type (= from to), got ${type_right.description}`);
      }
    } else {
      throw new Error(`Expected lt in (trans lt rt) to be of type (= from to), got ${type_left.description}`);
    }
  }
}

export class IndEqual extends Expr {
  public description = "ind-= expression";
  public constructor(public target: Expr, public motive: Expr, public base: Expr) { super(); }

  public override synth(context: Context): SynthResult {
    const { type, expr: core_t } = this.target.synth(context);
    if (type instanceof V.Equal) {
      const var_x = fresh(context, "x");
      const motive_type = create_pi_many(
        context,
        { name: var_x, value: type.X },
        [{
          name: fresh(context, "t"),
          value: new C.Equal(type.X, type.from.read_back(), new C.Var(var_x))
        }],
        new C.U()
      );
      const core_m = this.motive.check(context, motive_type);

      const value_m = core_m.normalise();
      const core_b = this.base.check(
        context,
        V.apply_many(value_m, type.from, new V.Same(type.from))
      );

      return {
        type: V.apply_many(value_m, type.to, core_t.normalise()),
        expr: new C.IndEqual(core_t, core_m, core_b)
      };
    } else {
      throw new Error(`Expected t in (ind-= t m b) to be of type (= from to), got ${type.description}`);
    }
  }
}

// Eithers

export class Either extends Expr {
  public description = "Either type";
  public constructor(public left: Expr, public right: Expr) { super(); }

  public override isType(context: Context): C.Core {
    const core_lt = this.left.isType(context);
    const core_rt = this.right.isType(context);
    return new C.Either(core_lt, core_rt);
  }

  public override synth(context: Context): SynthResult {
    const core_lt = this.left.check(context, new V.U());
    const core_rt = this.right.check(context, new V.U());
    return { type: new V.U(), expr: new C.Either(core_lt, core_rt) };
  }
}

export class Left extends Expr {
  public description = "left expression";
  public constructor(public value: Expr) { super(); }

  public override check(context: Context, against: V.Value): C.Core {
    if (against instanceof V.Either) {
      const core_lt = this.value.check(context, against.left);
      return new C.Left(core_lt);
    } else {
      throw new Error(`Expected lt in (left lt) to be of type P, got ${against.description}`);
    }
  }
}

export class Right extends Expr {
  public description = "right expression";
  public constructor(public value: Expr) { super(); }

  public override check(context: Context, against: V.Value) {
    if (against instanceof V.Either) {
      const core_lt = this.value.check(context, against.right);
      return new C.Right(core_lt);
    } else {
      throw new Error(`Expected rt in (right rt) to be of type R, got ${against.description}`);
    }
  }
}

export class IndEither extends Expr {
  public description = "ind-Either expression";
  public constructor(public target: Expr, public motive: Expr,
                     public left: Expr, public right: Expr) { super(); }

  public override synth(context: Context): SynthResult {
    const { type, expr: core_t } = this.target.synth(context);
    if (type instanceof V.Either) {
      const var_x = fresh(context, "x");
      const core_m = this.motive.check(context, new V.Pi(
        var_x, type, new V.U()
      ));

      const core_l = this.left.check(context, new V.Pi(
        var_x, type.left, apply_core_many(core_m, new C.Left(new C.Var(var_x)))
      ));

      const core_r = this.right.check(context, new V.Pi(
        var_x, type.right, apply_core_many(core_m, new C.Right(new C.Var(var_x)))
      ));

      return {
        type: apply_core_many(core_m, core_t),
        expr: new C.IndEither(core_t, core_m, core_l, core_r)
      };
    } else {
      throw new Error(`Expected t in (ind-Either t m l r) to be of type (Either P R), got ${type.description}`);
    }
  }
}

// Trivial

export class Trivial extends Expr {
  public description = "Trivial type";

  public override isType(_context: Context): C.Core {
    return new C.Trivial();
  }

  public override synth(_context: Context): SynthResult {
    return { type: new V.U(), expr: new C.Trivial() };
  }
}

export class Sole extends Expr {
  public description = "sole expression";

  public override synth(_context: Context): SynthResult {
    return { type: new V.Trivial(), expr: new C.Sole() };
  }
}

// Absurd

export class Absurd extends Expr {
  public description = "Absurd type";

  public override isType(_context: Context): C.Core {
    return new C.Absurd();
  }

  public override synth(_context: Context): SynthResult {
    return { type: new V.U(), expr: new C.Absurd() };
  }
}

export class IndAbsurd extends Expr {
  public description = "ind-Absurd expression";
  public constructor(public target: Expr, public motive: Expr) { super(); }

  public override synth(context: Context): SynthResult {
    const core_t = this.target.check(context, new V.Absurd()); const core_m = this.motive.isType(context);
    return { type: core_m.normalise(), expr: new C.IndAbsurd(core_t, core_m) };
  }
}

export class U extends Expr {
  public description = "U type";

  public override isType(_context: Context): C.Core {
    return new C.U();
  }
}
