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
  public synth(context: Context): SynthResult {
    const type_core  = this.type.isType(context);
    const type_value = type_core.normalise();
    const value_core = this.value.check(context, type_value);
    return { type: type_value, expr: value_core };
  }
}

export class Var extends Expr {
  public description = "Variable";
  public constructor(public name: Symbol) { super(); }
  public synth(context: Context): SynthResult {
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
  public synth(_context: Context): SynthResult { return { type: new V.U(), expr: new C.Atom() }; }
  public isType(_context: Context): C.Core { return new C.Atom(); }
}

export class Tick extends Expr {
  public description = "Tick expression";
  public constructor(public name: Symbol) { super(); }
  public synth() { return { type: new V.Atom(), expr: new C.Tick(this.name) }; }
}

// Pairs

export class Pair extends Expr {
  public description = "Pair type";
  public constructor(public left: Expr, public right: Expr) { super(); }

  public isType(context: Context): C.Core {
    const core_A = this.left.isType(context);
    const fresh_x = fresh(context, "x");
    const new_gamma = context.set(fresh_x, core_A.normalise());
    const core_body = this.right.isType(new_gamma);
    return new C.Sigma(fresh_x, core_A, core_body);
  }
}

export class Sigma extends Expr {
  public description = "Sigma expression";
  public constructor(public params: { name: Symbol, value: Expr }[], public base: Expr) { super(); }

  public synth(context: Context): SynthResult {
    const core = this.isType(context);
    return { type: new V.U(), expr: core };
  }

  public isType(context: Context): C.Core {
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

  public check(context: Context, against: V.Value): C.Core {
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

  public synth(context: Context): SynthResult {
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

  public synth(context: Context): SynthResult {
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

  public isType(context: Context): C.Core {
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
}

export class Pi extends Expr {
  public description = "Pi expression";
  public constructor(public params: { name: Symbol, value: Expr }[], public base: Expr) { super(); }

  public isType(context: Context): C.Core {
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
}

export class Lambda extends Expr {
  public description = "Lambda abstraction";
  public constructor(public params: Symbol[], public body: Expr) { super(); }

  public check(context: Context, against: V.Value): C.Core {
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

  public synth(context: Context): SynthResult {
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

  public isType(_context: Context): C.Core {
    return new C.Nat();
  }
}

export class Zero extends Expr {
  public description = "Zero expression";

  public synth(_context: Context): SynthResult {
    return { type: new V.Nat(), expr: new C.Zero() };
  }
}

export class Add1 extends Expr {
  public description = "Add1 expression";
  public constructor(public num: Expr) { super(); }

  public synth(context: Context): SynthResult {
    const core_num = this.num.check(context, new V.Nat());
    return { type: new V.Nat(), expr: new C.Add1(core_num) };
  }
}

export class NatLit extends Expr {
  public description = "Number literal";
  public constructor(public num: number) { super(); }

  public synth(_context: Context): SynthResult {
    let core_num = new C.Zero();
    for (let n = 0; n < this.num; n++)
      core_num = new C.Add1(core_num);
    return { type: new V.Nat(), expr: core_num };
  }
}

export class WhichNat extends Expr {
  public description = "which-Nat expression";
  public constructor(public target: Expr, public zero: Expr, public add1: Expr) { super(); }

  public synth(context: Context): SynthResult {
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

  public synth(context: Context): SynthResult {
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

  public synth(context: Context): SynthResult {
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

  public synth(context: Context): SynthResult {
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

  public isType(context: Context): C.Core {
    const core_e = this.e.isType(context);
    return new C.List(core_e);
  }
}

export class Nil extends Expr {
  public description = "List nil";

  public check(_context: Context, against: V.Value): C.Core {
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

  public synth(context: Context): SynthResult {
    const { type, expr: core_head } = this.head.synth(context);
    const core_tail = this.tail.check(context, new V.List(type));
    return { type: new V.List(type), expr: new C.ListCons(core_head, core_tail) };
  }
}

export class RecList extends Expr {
  public description = "rec-List expression";
  public constructor(public target: Expr, public nil: Expr, public cons: Expr) { super(); }

  public synth(context: Context): SynthResult {
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

  public synth(context: Context): SynthResult {
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

  public isType(context: Context): C.Core {
    const core_e = this.e.isType(context);
    const core_ell = this.ell.check(context, new V.Nat());
    return new C.Vec(core_e, core_ell);
  }
}

export class VecNil extends Expr {
  public description = "vecnil expression";

  public check(_context: Context, against: V.Value): C.Core {
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

  public check(context: Context, against: V.Value): C.Core {
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

  public synth(context: Context): SynthResult {
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

  public synth(context: Context): SynthResult {
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

  public synth(context: Context): SynthResult {
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
    } else {
      throw new Error(`Expected t in (ind-Vec ell t m b s) to be (Vec E ${value_ell}), got ${type_t}`);
    }
  }
}

// Equalities

export class Equal extends Expr {
  public constructor(public type: Expr, public left: Expr, public right: Expr) { }
  public synth() { }
  public isType() { }
  public check(against: V.Value) { }
}

export class Same extends Expr {
  public constructor(public thing: Expr) { }
  public synth() { }
  public isType() { }
  public check(against: V.Value) { }
}

export class Symm extends Expr {
  public constructor(public equal: Expr) { }
  public synth() { }
  public isType() { }
  public check(against: V.Value) { }
}

export class Cong extends Expr {
  public constructor(public target: Expr, public func: Expr) { }
  public synth() { }
  public isType() { }
  public check(against: V.Value) { }
}

export class Replace extends Expr {
  public constructor(public target: Expr, public motive: Expr, public base: Expr) { }
  public synth() { }
  public isType() { }
  public check(against: V.Value) { }
}

export class Trans extends Expr {
  public constructor(public left: Expr, public right: Expr) { }
  public synth() { }
  public isType() { }
  public check(against: V.Value) { }
}

export class IndEqual extends Expr {
  public constructor(public target: Expr, public motive: Expr, public base: Expr) { }
  public synth() { }
  public isType() { }
  public check(against: V.Value) { }
}

// Eithers

export class Either extends Expr {
  public constructor(public left: Expr, public right: Expr) { }
  public synth() { }
  public isType() { }
  public check(against: V.Value) { }
}

export class Left extends Expr {
  public constructor(public value: Expr) { }
  public synth() { }
  public isType() { }
  public check(against: V.Value) { }
}

export class Right extends Expr {
  public constructor(public value: Expr) { }
  public synth() { }
  public isType() { }
  public check(against: V.Value) { }
}

export class IndEither extends Expr {
  public constructor(public target: Expr, public motive: Expr,
                     public left: Expr, public right: Expr) { }
  public synth() { }
  public isType() { }
  public check(against: V.Value) { }
}

// Trivial

export class Trivial extends Expr {
  public synth() { }
  public isType() { }
  public check(against: V.Value) { }
}

export class Sole extends Expr {
  public synth() { }
  public isType() { }
  public check(against: V.Value) { }
}

// Absurd

export class Absurd extends Expr {
  public synth() { }
  public isType() { }
  public check(against: V.Value) { }
}

export class IndAbsurd extends Expr {
  public constructor(public target: Expr, public motive: Expr) { }
  public synth() { }
  public isType() { }
  public check(against: V.Value) { }
}

export class U extends Expr {
  public synth() { }
  public isType() { }
  public check(against: V.Value) { }
}
