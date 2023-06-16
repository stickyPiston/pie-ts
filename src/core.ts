import * as V from "./value.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";
import * as N from "./neutral.ts";

type Symbol = string;
export type Renaming = I.Map<Symbol, number>;
type Renamings = { left: Renaming; right: Renaming; next: number };

export abstract class Core {
    public eval(_gamma: V.Rho): V.Value {
        throw new Error(`Cannot evaluate ${this}`);
    }

    public abstract alpha_equiv(other: Core, context: Renamings): void;
}

export class Var extends Core {
    public constructor(public name: Symbol) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        if (gamma.has(this.name)) {
            return gamma.get(this.name) as V.Value;
        } else {
            throw new Error(`Could not find variable ${this.name}`);
        }
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Var) {
            const left = context.left.get(this.name);
            const right = context.right.get(other.name);
            if (left !== right) {
                throw new Error(`Not α-equiv: ${this.name} and ${other.name}`);
            }
        } else {
            throw new Error("Not structurally equiv Var");
        }
    }
}

export class Atom extends Core {
    public override eval(_gamma: V.Rho): V.Value {
        return new V.Atom();
    }

    public override alpha_equiv(other: Core, _context: Renamings): void {
        if (!(other instanceof Atom)) {
            throw new Error("Not structurally equiv Atom");
        }
    }
}

export class Tick extends Core {
    public constructor(public name: Symbol) {
        super();
    }

    public override eval(_gamma: V.Rho): V.Value {
        return new V.Tick(this.name);
    }

    public override alpha_equiv(other: Core, _context: Renamings): void {
        if (other instanceof Tick) {
            if (this.name !== other.name) {
                throw new Error(`Not α-equiv ${this.name} and ${other.name}`);
            }
        } else {
            throw new Error("Not structurally equiv Tick");
        }
    }
}

function add_renaming(x: Symbol, y: Symbol, r: Renamings): Renamings {
    return {
        left: r.left.set(x, r.next),
        right: r.right.set(y, r.next),
        next: r.next + 1,
    };
}

export class Sigma extends Core {
    public constructor(
        public name: Symbol,
        public value: Core,
        public body: Core,
    ) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        const eval_value = this.value.eval(gamma);
        const clos_body = new V.Closure(gamma, this.body);
        return new V.Sigma(this.name, eval_value, clos_body);
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Sigma) {
            this.value.alpha_equiv(other.value, context);
            this.body.alpha_equiv(
                other.body,
                add_renaming(this.name, other.name, context),
            );
        } else {
            throw new Error("Not structurally equiv Sigma");
        }
    }
}

export class Cons extends Core {
    public constructor(public left: Core, public right: Core) {
        super();
    }

    public override eval(context: V.Rho): V.Value {
        return new V.Cons(this.left.eval(context), this.right.eval(context));
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Cons) {
            this.left.alpha_equiv(other.left, context);
            this.right.alpha_equiv(other.right, context);
        } else {
            throw new Error("Not structurally equiv Cons");
        }
    }
}

export class Car extends Core {
    public constructor(public pair: Core) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        return Car.do(this.pair.eval(gamma) as V.Cons | V.Neutral);
    }

    public static do(pair: V.Cons | V.Neutral): V.Value {
        if (pair instanceof V.Neutral) {
            return new V.Neutral(
                (pair.type as V.Sigma).value,
                new N.Car(pair.neutral),
            );
        } else {
            return pair.fst;
        }
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Car) {
            this.pair.alpha_equiv(other.pair, context);
        } else {
            throw new Error("Not structurally equiv Car");
        }
    }
}

export class Cdr extends Core {
    public constructor(public pair: Core) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        const eval_pair = this.pair.eval(gamma) as V.Cons | V.Neutral;
        if (eval_pair instanceof V.Neutral) {
            const sigma = eval_pair.type as V.Sigma;
            return new V.Neutral(
                sigma.body.instantiate(sigma.name, Car.do(eval_pair)),
                new N.Car(eval_pair.neutral),
            );
        } else {
            return eval_pair.snd;
        }
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Cdr) {
            this.pair.alpha_equiv(other.pair, context);
        } else {
            throw new Error("Not structurally equiv Car");
        }
    }
}

export class Pi extends Core {
    public constructor(
        public name: Symbol,
        public value: Core,
        public body: Core,
    ) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        const clos_body = new V.Closure(gamma, this.body);
        return new V.Pi(this.name, this.value.eval(gamma), clos_body);
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Pi) {
            this.value.alpha_equiv(other.value, context);
            this.body.alpha_equiv(
                other.body,
                add_renaming(this.name, other.name, context),
            );
        } else {
            throw new Error("Not structurally equiv Pi");
        }
    }
}

export class Lambda extends Core {
    public constructor(public name: Symbol, public body: Core) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        const clos_body = new V.Closure(gamma, this.body);
        return new V.Lambda(this.name, clos_body);
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Lambda) {
            this.body.alpha_equiv(
                other.body,
                add_renaming(this.name, other.name, context),
            );
        } else {
            throw new Error("Not structurally equiv Lambda");
        }
    }
}

export class Appl extends Core {
    public constructor(public func: Core, public arg: Core) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        return Appl.do(
            this.func.eval(gamma) as V.Lambda | V.Neutral,
            this.arg.eval(gamma),
        );
    }

    public static do(func: V.Lambda | V.Neutral, arg: V.Value): V.Value {
        if (func instanceof V.Lambda) {
            return func.body.instantiate(func.name, arg);
        } else {
            const pi = func.type as V.Pi;
            return new V.Neutral(
                pi.body.instantiate(pi.name, arg),
                new N.Appl(func.neutral, new N.Normal(arg, pi.value)),
            );
        }
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Appl) {
            this.func.alpha_equiv(other.func, context);
            this.arg.alpha_equiv(other.arg, context);
        } else {
            throw new Error("Not structurally equiv Appl");
        }
    }
}

export function to_bound(gamma: V.Rho): V.Bound {
    return gamma.keySeq().toList();
}

export class U extends Core {
    public override eval(_gamma: V.Rho): V.Value {
        return new V.U();
    }

    public override alpha_equiv(other: Core, _context: Renamings): void {
        if (!(other instanceof U)) {
            throw new Error("Not structurally equiv U");
        }
    }
}

export class Coproduct extends Core {
    public constructor(public left: Core, public right: Core) { super(); }

    public override eval(gamma: V.Rho): V.Value {
        const value_left = this.left.eval(gamma),
              value_right = this.right.eval(gamma);
        return new V.Coproduct(value_left, value_right);
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Coproduct) {
            this.left.alpha_equiv(other.left, context);
            this.right.alpha_equiv(other.right, context);
        } else {
            throw new Error("Not structurally equiv Coproduct");
        }
    }
}

export class Inl extends Core {
    public constructor(public value: Core) { super(); }

    public override eval(gamma: V.Rho): V.Value {
        return new V.Inl(this.value.eval(gamma));
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Inl) {
            this.value.alpha_equiv(other.value, context);
        } else {
            throw new Error("Not structurally equiv Inl");
        }
    }
}

export class Inr extends Core {
    public constructor(public value: Core) { super(); }

    public override eval(gamma: V.Rho): V.Value {
        return new V.Inr(this.value.eval(gamma));
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Inr) {
            this.value.alpha_equiv(other.value, context);
        } else {
            throw new Error("Not structurally equiv Inr");
        }
    }
}

export class IndCoproduct extends Core {
    public constructor(
        public target: Core,
        public motive: V.Value,
        public left: Core,
        public right: Core
    ) { super(); }

    public override eval(gamma: V.Rho): V.Value {
        const target = this.target.eval(gamma) as V.Inl | V.Inr;
        if (target instanceof V.Inl) {
            const func = this.left.eval(gamma);
            return V.apply_many(func, target.value);
        } else {
            const func = this.right.eval(gamma);
            return V.apply_many(func, target.value);
        }
    }
        
    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof IndCoproduct) {
            this.target.alpha_equiv(other.target, context);
            this.left.alpha_equiv(other.left, context);
            this.right.alpha_equiv(other.right, context);
        } else {
            throw new Error("Not structurally equiv IndCoproduct");
        }
    }
}