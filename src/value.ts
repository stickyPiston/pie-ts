import * as C from "./core.ts";
import * as N from "./neutral.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";

type Symbol = string;
export type Bound = I.List<Symbol>;
export type Rho = I.Map<Symbol, Value>;

export class Closure {
    public constructor(public context: Rho, public body: C.Core) { }
    public instantiate(name: Symbol, value: Value): Value {
        return this.body.eval(this.context.set(name, value));
    }

    public toString(): string {
        return this.body.toString();
    }
}

export function fresh(names: Bound, x: Symbol): Symbol {
    let name = x;
    while (names.contains(name)) {
        name += "_";
    }
    return name;
}

export abstract class Value {
    public abstract description: string;

    public read_back(_context: Rho, _bound: Bound, type: Value): C.Core {
        throw new Error(
            `Could not read back normal form ${this.description} : ${type.description}`,
        );
    }

    public read_back_type(_context: Rho, _bound: Bound): C.Core {
        throw new Error(`Could not read back type ${this.description}`);
    }

    public same_type(context: Rho, bound: Bound, other: Value): void {
        const core_self = this.read_back_type(context, bound);
        const core_other = other.read_back_type(context, bound);
        const empty = {
            left: I.Map() as C.Renaming,
            right: I.Map() as C.Renaming,
            next: 0,
        };
        core_self.alpha_equiv(core_other, empty);
    }

    public same_value(
        context: Rho,
        bound: Bound,
        type: Value,
        other: Value,
    ): void {
        const core_self = this.read_back(context, bound, type);
        const core_other = other.read_back(context, bound, type);
        const empty = {
            left: I.Map() as C.Renaming,
            right: I.Map() as C.Renaming,
            next: 0,
        };
        core_self.alpha_equiv(core_other, empty);
    }

    abstract toString(): string;
}

// Types

export abstract class Type extends Value {
    public override read_back(
        context: Rho,
        bound: Bound,
        _type: Value,
    ): C.Core {
        return this.read_back_type(context, bound);
    }
}

export class U extends Type {
    public description = "U type";
    public override read_back_type(): C.Core {
        return new C.U();
    }

    public override toString(): string {
        return "U";
    }
}

export class Atom extends Type {
    public description = "Atom type";
    public override read_back_type(): C.Core {
        return new C.Atom();
    }

    public override toString(): string {
        return "Atom";
    }
}

export class Sigma extends Type {
    public description = "Sigma type";
    public constructor(
        public name: Symbol,
        public value: Value,
        public body: Closure,
    ) {
        super();
    }

    public override read_back_type(context: Rho, bound: Bound): C.Core {
        const y = fresh(bound, this.name);
        const value = new Neutral(this.value, new N.Var(y));
        const dV = this.body.instantiate(this.name, value);
        return new C.Sigma(
            y,
            this.value.read_back_type(context, bound),
            dV.read_back_type(context, bound.push(y)),
        );
    }

    public override toString(): string {
        return `(Σ (${this.name} ${this.value}) ${this.body})`;
    }
}

export class Pi extends Type {
    public description = "Pi type";
    public constructor(
        public name: Symbol,
        public value: Value,
        public body: Closure,
    ) {
        super();
    }

    public override read_back_type(context: Rho, bound: Bound): C.Core {
        const y = fresh(bound, this.name);
        const value = new Neutral(this.value, new N.Var(y));
        const dV = this.body.instantiate(this.name, value);
        return new C.Pi(
            y,
            this.value.read_back_type(context, bound),
            dV.read_back_type(context, bound.push(y)),
        );
    }

    public override toString(): string {
        return `(Π (${this.name} ${this.value}) ${this.body})`;
    }
}

// Constructors

export class Cons extends Value {
    public description = "cons expression";
    public constructor(public fst: Value, public snd: Value) {
        super();
    }
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

    public override toString(): string {
        return `(cons ${this.fst} ${this.snd})`;
    }
}

export class Lambda extends Value {
    public description = "lambda expression";
    public constructor(public name: Symbol, public body: Closure) {
        super();
    }

    public override read_back(context: Rho, bound: Bound, type: Value): C.Core {
        if (type instanceof Pi) {
            const y = fresh(bound, this.name);
            const value = new Neutral(type.value, new N.Var(y));
            const value_body = type.body.instantiate(type.name, value);
            const core_body = apply_many(this, value)
                .read_back(context, bound.push(y), value_body);
            return new C.Lambda(y, core_body);
        } else {
            return super.read_back(context, bound, type);
        }
    }

    public override toString(): string {
        return `(λ (${this.name}) ${this.body})`;
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

export class Tick extends Value {
    public description = "tick expression";
    public constructor(public name: Symbol) {
        super();
    }

    public override read_back(context: Rho, bound: Bound, type: Value): C.Core {
        if (type instanceof Atom) {
            return new C.Tick(this.name);
        } else {
            return super.read_back(context, bound, type);
        }
    }

    public override toString(): string {
        return `'${this.name}`;
    }
}

export class Neutral extends Value {
    public description = "Neutral expression";
    public constructor(public type: Value, public neutral: N.Neutral) {
        super();
    }

    public read_back_type(context: Rho, bound: Bound): C.Core {
        if (this.type instanceof U) {
            return this.neutral.read_back(context);
        } else {
            return super.read_back_type(context, bound);
        }
    }

    public read_back(context: Rho, _bound: Bound): C.Core {
        return this.neutral.read_back(context);
    }

    public override toString(): string {
        return this.neutral.toString();
    }
}

export class Coproduct extends Type {
    public description = "Coproduct expression";
    public constructor(public left: Value, public right: Value) { super(); }

    public override read_back_type(context: Rho, bound: Bound) {
        const core_l = this.left.read_back_type(context, bound),
              core_r = this.right.read_back_type(context, bound);
        return new C.Coproduct(core_l, core_r);
    }

    public override toString(): string {
        return `(+ ${this.left} ${this.right})`;
    }
}

export class Inl extends Value {
    public description = "Inl expression";
    public constructor(public value: Value) { super(); }

    public override read_back(context: Rho, bound: Bound, type: Value): C.Core {
        if (type instanceof Coproduct) {
            return new C.Inl(this.value.read_back(context, bound, type.left));
        } else {
            return super.read_back(context, bound, type);
        }
    }

    public override toString(): string {
        return `(inl ${this.value})`;
    }
}

export class Inr extends Value {
    public description = "Inr expression";
    public constructor(public value: Value) { super(); }

    public override read_back(context: Rho, bound: Bound, type: Value): C.Core {
        if (type instanceof Coproduct) {
            return new C.Inr(this.value.read_back(context, bound, type.right));
        } else {
            return super.read_back(context, bound, type);
        }
    }

    public override toString(): string {
        return `(inr ${this.value})`;
    }
}