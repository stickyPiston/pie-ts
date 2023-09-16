import * as C from "./core.ts";
import * as N from "./neutral.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";
import * as O from "./context.ts";

type Symbol = O.Symbol;

export class Closure {
    public constructor(public context: O.Rho, public body: C.Core) { }
    public instantiate(name: Symbol, value: Value): Value {
        return this.body.eval(this.context.set(name, value));
    }

    public toString(): string {
        return this.body.toString();
    }
}

export abstract class Value {
    public abstract description: string;

    public read_back(_context: O.Rho, _bound: O.Bound, type: Value): C.Core {
        throw new Error(`Could not read back normal form ${this.description} : ${type.description}`);
    }

    public read_back_type(_context: O.Rho, _bound: O.Bound): C.Core {
        throw new Error(`Could not read back type ${this.description}`);
    }

    public same_type(context: O.Rho, bound: O.Bound, other: Value): void {
        const core_self = this.read_back_type(context, bound);
        const core_other = other.read_back_type(context, bound);
        core_self.alpha_equiv(core_other, new O.Renamings);
    }

    public same_value(context: O.Rho, bound: O.Bound, type: Value, other: Value): void {
        const core_self = this.read_back(context, bound, type);
        const core_other = other.read_back(context, bound, type);
        core_self.alpha_equiv(core_other, new O.Renamings);
    }

    abstract toString(): string;
}

// Types

export abstract class Type extends Value {
    public override read_back(
        context: O.Rho,
        bound: O.Bound,
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

    public override read_back_type(context: O.Rho, bound: O.Bound): C.Core {
        const y = bound.fresh(this.name);
        const value = new Neutral(this.value, new N.Var(y));
        const dV = this.body.instantiate(this.name, value);
        return new C.Sigma(
            y,
            this.value.read_back_type(context, bound),
            dV.read_back_type(context, bound.set(y)),
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

    public override read_back_type(context: O.Rho, bound: O.Bound): C.Core {
        const y = bound.fresh(this.name);
        const value = new Neutral(this.value, new N.Var(y));
        const dV = this.body.instantiate(this.name, value);
        return new C.Pi(
            y,
            this.value.read_back_type(context, bound),
            dV.read_back_type(context, bound.set(y)),
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
    public override read_back(context: O.Rho, bound: O.Bound, type: Value): C.Core {
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

    public override read_back(context: O.Rho, bound: O.Bound, type: Value): C.Core {
        if (type instanceof Pi) {
            const y = bound.fresh(this.name);
            const value = new Neutral(type.value, new N.Var(y));
            const value_body = type.body.instantiate(type.name, value);
            const core_body = apply_many(this, value)
                .read_back(context, bound.set(y), value_body);
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

    public override read_back(context: O.Rho, bound: O.Bound, type: Value): C.Core {
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

    public read_back_type(context: O.Rho, bound: O.Bound): C.Core {
        if (this.type instanceof U) {
            return this.neutral.read_back(context);
        } else {
            return super.read_back_type(context, bound);
        }
    }

    public read_back(context: O.Rho, _bound: O.Bound): C.Core {
        return this.neutral.read_back(context);
    }

    public override toString(): string {
        return this.neutral.toString();
    }
}

// Data types

// export type DatatypeParameter = { expr: Value, type: Value };

// export class Constructor extends Value {
//     public description = "Constructor";

//     public constructor(
//         public name: Symbol,
//         public args: I.List<DatatypeParameter>,
//         public type: Datatype
//     ) { super(); }

//     public override read_back(context: O.Rho, bound: O.Bound, type: Value): C.Core {
//         if (type instanceof Datatype && type.name === this.type.name) {
//             const core_args = this.args.map(({ expr, type }) => ({ expr: expr.read_back(context, bound, type), type: type.read_back_type(context, bound) }));
//             const core_type = this.type.read_back_type(context, bound) as C.Datatype;
//             return new C.Constructor(this.name, core_args, core_type);
//         } else {
//             return super.read_back(context, bound, type);
//         }
//     }

//     public override toString(): string {
//         return `(${this.name} ${this.args.join(" ")})`;
//     }
// }

// type Param = { name: Symbol, value: Value };

// export class ConstructorInfo {
//     public constructor(
//         public parameters: I.List<Param>,
//         public type: I.List<Value>
//     ) { }

//     public read_back(parameters: I.List<Value>, indices: I.List<Value>, context: O.Rho, bound: O.Bound): C.ConstructorInfo {
//         return new C.ConstructorInfo(
//             this.parameters.map(({ name, value }) => ({ name, value: value.read_back_type(context, bound) })),
//             this.type.zipWith((t, type) => t.read_back(context, bound, type), parameters.concat(indices))
//         );
//     }
// }

// export class Datatype extends Type {
//     public description = "Datatype";

//     public constructor(
//         public name: Symbol,
//         public parameters: I.List<DatatypeParameter>,
//         public indices: I.List<DatatypeParameter>,
//         public constructors: I.Map<Symbol, ConstructorInfo>
//     ) { super(); }

//     public override read_back_type(context: O.Rho, bound: O.Bound): C.Core {
//         const parameters = Datatype.read_back_parameters(this.parameters, context, bound);
//         const indices = Datatype.read_back_parameters(this.indices, context, bound);
//         const constructors = this.constructors.map(c => c.read_back(
//             this.parameters.map(p => p.type),
//             this.indices.map(i => i.type),
//             context, bound));
//         return new C.Datatype(this.name, parameters, indices, constructors);
//     }

//     private static read_back_parameters(parameters: I.List<DatatypeParameter>, context: O.Rho, bound: O.Bound): I.List<C.DatatypeParameter> {
//         return parameters.map(({ expr, type }) => ({ expr: expr.read_back(context, bound, type), type: type.read_back_type(context, bound) }));
//     }

//     public override toString(): string {
//         const parameters = this.parameters
//             .concat(this.indices)
//             .map(({ expr, type }) => `(the ${type.toString()} ${expr.toString()})`).join(" ");
//         return `(${this.name} ${parameters})`;
//     }
// }