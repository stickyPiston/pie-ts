import * as C from "./core.ts";
import * as N from "./neutral.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";

type Symbol = string;
type Bound = I.List<Symbol>;
export type Rho = I.Map<Symbol, Value>;

export class Closure<T> {
    public constructor(public context: I.Map<Symbol, T>, public body: C.Core) { }
    public instantiate(name: Symbol, value: T) {
        return this.body.eval(this.context.set(name, value));
    }
}

function fresh(names: Bound, x: Symbol): Symbol {
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

// Constructors

export class Add1 extends Value {
    public constructor(public n: Value) { }
}

export class Sole extends Value { }

export class Zero extends Value { }

export class Nil extends Value { }

export class VecNil extends Value { }

export class Equal extends Value {
    public constructor(public X: Value, public from: Value, public to: Value) { super(); }
}

export class Lambda extends Value {
    public constructor(public name: Symbol, public body: Closure<Value>) { super(); }
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
    public constructor(public thing: Value) { super(); }
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
