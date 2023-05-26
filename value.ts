import * as C from "./core.ts";
import * as N from "./neutral.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";

type Symbol = string;
export type Bound = I.List<Symbol>;
export type Rho = I.Map<Symbol, Value>;

export class Closure<T> {
    public constructor(public context: I.Map<Symbol, T>, public body: C.Core) { }
    public instantiate(name: Symbol, value: T): Value {
        return this.body.eval(this.context.set(name, value));
    }
}

export function fresh(names: Bound, x: Symbol): Symbol {
    let name = x;
    while (names.contains(name))
        name += "_";
    return name;
}

export abstract class Value {
    public abstract description: string;

    public read_back(_context: Rho, _bound: Bound, type: Value): C.Core {
        throw new Error(`Could not read back normal form ${this.description} : ${type.description}`);
    }

    public read_back_type(_context: Rho, _bound: Bound): C.Core {
        throw new Error(`Could not read back type ${this.description}`);
    }

    public same_type(context: Rho, bound: Bound, other: Value): void {
        const core_self = this.read_back_type(context, bound);
        const core_other = other.read_back_type(context, bound);
        core_self.alpha_equiv(core_other);
    }

    public same_value(context: Rho, bound: Bound, type: Value, other: Value): void {
        const core_self = this.read_back(context, bound, type);
        const core_other = other.read_back(context, bound, type);
        core_self.alpha_equiv(core_other);
    }
}

// Types

abstract class Type extends Value {
    public override read_back(context: Rho, bound: Bound, _type: Value): C.Core {
        return this.read_back_type(context, bound);
    }
}

export class Nat extends Type {
    public description = "Nat type";
    public override read_back_type(): C.Core {
        return new C.Nat();
    }
}

export class U extends Type {
    public description = "U type";
    public override read_back_type(): C.Core {
        return new C.U();
    }
}

export class Atom extends Type {
    public description = "Atom type";
    public override read_back_type(): C.Core {
        return new C.Atom();
    }
}

export class Trivial extends Type {
    public description = "Trivial type";
    public override read_back_type(): C.Core {
        return new C.Trivial();
    }
}

export class Absurd extends Type {
    public description = "Absurd type";
    public override read_back_type(): C.Core {
        return new C.Absurd();
    }
}

export class Sigma extends Type {
    public description = "Sigma type";
    public constructor(public name: Symbol, public value: Value, public body: Closure<Value>) { super(); }

    public override read_back_type(context: Rho, bound: Bound): C.Core {
        const y = fresh(bound, this.name);
        const value = new Neutral(this.value, new N.Var(y));
        const dV = this.body.instantiate(this.name, value);
        return new C.Sigma(y, this.value.read_back_type(context, bound),
                           dV.read_back_type(context, bound.push(y)));
    }
}

export class Pi extends Type {
    public description = "Pi type";
    public constructor(public name: Symbol, public value: Value, public body: Closure<Value>) { super(); }

    public override read_back_type(context: Rho, bound: Bound): C.Core {
        const y = fresh(bound, this.name);
        const value = new Neutral(this.value, new N.Var(y));
        const dV = this.body.instantiate(this.name, value);
        return new C.Pi(y, this.value.read_back_type(context, bound),
                        dV.read_back_type(context, bound.push(y)));
    }
}

export class List extends Type {
    public description = "List type";
    public constructor(public e: Value) { super(); }

    public override read_back_type(context: Rho, bound: Bound): C.Core {
        const core_e = this.e.read_back_type(context, bound);
        return new C.List(core_e);
    }
}

export class Vec extends Type {
    public description = "Vec type";
    public constructor(public e: Value, public ell: Value) { super(); }

    public override read_back_type(context: Rho, bound: Bound): C.Core {
        const core_e = this.e.read_back_type(context, bound);
        const core_ell = this.ell.read_back(context, bound, new Nat());
        return new C.Vec(core_e, core_ell);
    }
}

export class Either extends Type {
    public description = "Either type";
    public constructor(public left: Value, public right: Value) { super(); }
    public override read_back_type(context: Rho, bound: Bound): C.Core {
        const core_left = this.left.read_back_type(context, bound);
        const core_right = this.right.read_back_type(context, bound);
        return new C.Either(core_left, core_right);
    }
}

export class Equal extends Type {
    public description = "= type";
    public constructor(public X: Value, public from: Value, public to: Value) { super(); }
    public override read_back_type(context: Rho, bound: Bound): C.Core {
        const core_from = this.from.read_back_type(context, bound);
        const core_to = this.to.read_back_type(context, bound);
        return new C.Equal(this.X, core_from, core_to);
    }
}

// Constructors

export class Add1 extends Value {
    public description = "add1 expression";
    public constructor(public n: Value) { super(); }
    public override read_back(context: Rho, bound: Bound, type: Value): C.Core {
        if (type instanceof Nat) {
            const core_n = this.n.read_back(context, bound, type);
            return new C.Add1(core_n);
        } else {
            return super.read_back(context, bound, type);
        }
    }
}

export class Zero extends Value {
    public description = "zero expression";
    public override read_back(context: Rho, bound: Bound, type: Value): C.Core {
        if (type instanceof Nat) {
            return new C.Zero();
        } else {
            return super.read_back(context, bound, type);
        }
    }
}

export class Sole extends Value {
    public description = "sole expression";
    public override read_back(context: Rho, bound: Bound, type: Value): C.Core {
        if (type instanceof Trivial) {
            return new C.Sole();
        } else {
            return super.read_back(context, bound, type);
        }
    }
}

export class Cons extends Value {
    public description = "cons expression";
    public constructor(public fst: Value, public snd: Value) { super(); }
    public override read_back(context: Rho, bound: Bound, type: Value): C.Core {
        if (type instanceof Sigma) {
            const core_fst = this.fst.read_back(context, bound, type.value);
            const snd_type = type.body.instantiate(type.name, this.snd);
            const core_snd = this.snd.read_back(context, bound, snd_type);
            return new C.Cons(core_fst, core_snd);
        } else {
            return super.read_back(context, bound, type);
        }
    }
}

export class ListCons extends Value {
    public description = ":: expression";
    public constructor(public head: Value, public tail: Value) { super(); }
    public override read_back(context: Rho, bound: Bound, type: Value): C.Core {
        if (type instanceof List) {
            const core_head = this.head.read_back(context, bound, type.e);
            const core_tail = this.tail.read_back(context, bound, type);
            return new C.ListCons(core_head, core_tail);
        } else {
            return super.read_back(context, bound, type);
        }
    }
}

export class Nil extends Value {
    public description = "nil expression";
    public override read_back(context: Rho, bound: Bound, type: Value): C.Core {
        if (type instanceof List) {
            return new C.Nil();
        } else {
            return super.read_back(context, bound, type);
        }
    }
}

export class VecCons extends Value {
    public description = "vec:: expression";
    public constructor(public head: Value, public tail: Value) { super(); }
    public override read_back(context: Rho, bound: Bound, type: Value): C.Core {
        if (type instanceof Vec && type.ell instanceof Add1) {
            const core_head = this.head.read_back(context, bound, type.e);
            const tail_type = new Vec(type.e, type.ell.n);
            const core_tail = this.tail.read_back(context, bound, tail_type);
            return new C.VecCons(core_head, core_tail);
        } else {
            return super.read_back(context, bound, type);
        }
    }
}

export class VecNil extends Value {
    public description = "vecnil expression";
    public override read_back(context: Rho, bound: Bound, type: Value): C.Core {
        if (type instanceof Vec && type.ell instanceof Zero) {
            return new C.VecNil();
        } else {
            return super.read_back(context, bound, type);
        }
    }
}

export class Lambda extends Value {
    public description = "lambda expression";
    public constructor(public name: Symbol, public body: Closure<Value>) { super(); }
    public override read_back(context: Rho, bound: Bound, type: Value): C.Core {
        if (type instanceof Pi) {
            const y = fresh(bound, this.name);
            const value = new Neutral(type.value, new N.Var(y));
            const value_body = type.body.instantiate(this.name, value);
            const core_body = apply_many(this, value)
                .read_back(context, bound.push(y), value_body);
            return new C.Lambda(y, core_body);
        } else {
            return super.read_back(context, bound, type);
        }
    }
}

export function apply_many(func: Value, ...args: Value[]): Value {
    return args.reduce((acc, arg) => {
        if (acc instanceof Lambda) {
            return acc.body.instantiate(acc.name, arg);
        } else {
            throw new Error(`Expected a function, got ${acc.description}`);
        }
    }, func);
}

export class Same extends Value {
    public description = "same expression";
    public constructor(public thing: Value) { super(); }
    public override read_back(context: Rho, bound: Bound, type: Value): C.Core {
        if (type instanceof Equal) {
            const core_thing = this.thing.read_back(context, bound, type.X);
            return new C.Same(core_thing);
        } else {
            return super.read_back(context, bound, type);
        }
    }
}

export class Left extends Value {
    public description = "left expression";
    public constructor(public value: Value) { super(); }
    public override read_back(context: Rho, bound: Bound, type: Value): C.Core {
        if (type instanceof Either) {
            const core_value = this.value.read_back(context, bound, type.left);
            return new C.Left(core_value);
        } else {
            return super.read_back(context, bound, type);
        }
    }
}

export class Right extends Value {
    public description = "right expression";
    public constructor(public value: Value) { super(); }
    public override read_back(context: Rho, bound: Bound, type: Value): C.Core {
        if (type instanceof Either) {
            const core_value = this.value.read_back(context, bound, type.right);
            return new C.Right(core_value);
        } else {
            return super.read_back(context, bound, type);
        }
    }
}

export class Tick extends Value {
    public description = "tick expression";
    public constructor(public name: Symbol) { super(); }
    public override read_back(context: Rho, bound: Bound, type: Value): C.Core {
        if (type instanceof Atom) {
            return new C.Tick(this.name);
        } else {
            return super.read_back(context, bound, type);
        }
    }
}

export class Neutral extends Value {
    public description = "Neutral expression";
    public constructor(public type: Value, public neutral: N.Neutral) { super(); }

    public read_back_type(context: Rho, bound: Bound): C.Core {
        if (this.type instanceof U) {
            return this.neutral.read_back(context);
        } else {
            return super.read_back_type(context, bound);
        }
    }
}
