import * as V from "./value.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";
import * as N from "./neutral.ts";
import * as A from "./pattern.ts";

type Symbol = string;

/**
 * A renaming map maps variable names to unique indices
 */
type Renaming = I.Map<Symbol, number>;

/**
 * Renamings class contains renaming maps for 2 core expressions at the same time.
 * Two variables are the same when the indices in both maps are the same
 */
export class Renamings {
    private left = I.Map() as Renaming;
    private right = I.Map() as Renaming;
    private next = 0;

    /**
     * Add two symbols to the renaming maps
     * @param x the left variable
     * @param y the right variable
     * @returns an updated version of this class
     */
    public add(x: Symbol, y: Symbol): Renamings {
        const renamings = new Renamings();
        renamings.left = this.left.set(x, this.next);
        renamings.right = this.right.set(y, this.next);
        renamings.next = this.next + 1;
        return renamings;
    }

    /**
     * Check whether two variables point to the same α-normalised variable
     * @param x the left variable
     * @param y the right variable
     * @returns true when they are the same, false otherwise
     */
    public check(x: Symbol, y: Symbol): boolean {
        return this.left.get(x) === this.right.get(y);
    }
}

/**
 * Abstract class for core expressions, which is the language for well-typed Pie expressions
 */
export abstract class Core {
    /**
     * Evaluate a core expression to its normal form
     * @param _rho the context 
     * @throws when the expression does not have a normal form because of an ill-formed expression
     */
    public eval(_rho: V.Rho): V.Value {
        throw new Error(`Cannot evaluate ${this}`);
    }

    /**
     * Checks whether two core expressions are α-equivalent, i.e. structurally equivalent up to variable names
     * @param other the other core expression to be checked against
     * @param context the set of renamings to use during α-checking,
     *     the renamings are used to check whether variables are bound to the same bindings
     * @throws when two expressions are not equivalent, otherwise returns void
     */
    public abstract alpha_equiv(other: Core, context: Renamings): void;

    /**
     * Returns the readable string representation of this core expression
     */
    public abstract toString(): string;
}

export class Var extends Core {
    /**
     * @param name this variable's identifier
     */
    public constructor(public name: Symbol) { super(); }

    public override eval(gamma: V.Rho): V.Value {
        if (gamma.has(this.name)) {
            return gamma.get(this.name) as V.Value;
        } else {
            throw new Error(`Could not find variable ${this.name}`);
        }
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Var) {
            if (context.check(this.name, other.name)) {
                throw new Error(`Not α-equiv: ${this.name} and ${other.name}`);
            }
        } else {
            throw new Error("Not structurally equiv Var");
        }
    }

    public override toString(): string {
        return this.name;
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

    public override toString(): string {
        return "Atom";
    }
}

export class Tick extends Core {
    /**
     * @param name the identifier after the apostrophe
     */
    public constructor(public name: Symbol) { super(); }

    public override eval(_gamma: V.Rho): V.Value {
        return new V.Tick(this.name);
    }

    public override alpha_equiv(other: Core, _context: Renamings): void {
        // Ticks are structurally equivalent when the names are the same
        // Renamings are not relevant here
        if (other instanceof Tick) {
            if (this.name !== other.name) {
                throw new Error(`Not α-equiv ${this.name} and ${other.name}`);
            }
        } else {
            throw new Error("Not structurally equiv Tick");
        }
    }

    public override toString(): string {
        return `'${this.name}`;
    }
}

export class Sigma extends Core {
    /**
     * @param name the binding name of the car of the sigma
     * @param value the type of the sigma's car
     * @param body the type of the sigma's cdr
     */
    public constructor(
        public name: Symbol,
        public value: Core,
        public body: Core,
    ) { super(); }

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
                context.add(this.name, other.name)
            );
        } else {
            throw new Error("Not structurally equiv Sigma");
        }
    }

    public override toString(): string {
        return `(Σ ((${this.name} ${this.value.toString()})) ${this.body.toString()})`;
    }
}

export class Cons extends Core {
    /**
     * @param left the car of the pair
     * @param right the cdr of the pair
     */
    public constructor(
        public left: Core,
        public right: Core
    ) { super(); }

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

    public override toString(): string {
        return `(cons ${this.left.toString()} ${this.right.toString()})`;
    }
}

export class Car extends Core {
    /**
     * @param pair the pair to take the car of
     */
    public constructor(public pair: Core) { super(); }

    public override eval(gamma: V.Rho): V.Value {
        return Car.do(this.pair.eval(gamma) as V.Cons | V.Neutral);
    }

    /**
     * Execute car's operation on a value, we need to separate static method to do this
     * because cdr's eval's neutral branch needs to compute the type of the resulting value
     * which requires instatiating the closure with the pair's car.
     * @param pair the pair to get the first element from
     * @returns the first element of the pair
     */
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

    public override toString(): string {
        return `(car ${this.pair.toString()})`;
    }
}

export class Cdr extends Core {
    /**
     * @param pair the pair to take the cdr of
     */
    public constructor(public pair: Core) { super(); }

    public override eval(gamma: V.Rho): V.Value {
        const eval_pair = this.pair.eval(gamma) as V.Cons | V.Neutral;
        if (eval_pair instanceof V.Neutral) {
            const sigma = eval_pair.type as V.Sigma;
            return new V.Neutral(
                // Instantiating sigma with the car gives the second part of the pair
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

    public override toString(): string {
        return `(cdr ${this.pair.toString()})`;
    }
}

export class Pi extends Core {
    /**
     * @param name the parameter's name
     * @param value the parameter's type
     * @param body the return type
     */
    public constructor(
        public name: Symbol,
        public value: Core,
        public body: Core,
    ) { super(); }

    public override eval(gamma: V.Rho): V.Value {
        const clos_body = new V.Closure(gamma, this.body);
        return new V.Pi(this.name, this.value.eval(gamma), clos_body);
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Pi) {
            this.value.alpha_equiv(other.value, context);
            this.body.alpha_equiv(
                other.body,
                context.add(this.name, other.name)
            );
        } else {
            throw new Error("Not structurally equiv Pi");
        }
    }

    public override toString(): string {
        return `(Π ((${this.name} ${this.value.toString()})) ${this.body.toString()})`;
    }
}

export class Lambda extends Core {
    /**
     * @param name the parameter's name
     * @param body the lambda's body
     */
    public constructor(
        public name: Symbol,
        public body: Core
    ) { super(); }

    public override eval(gamma: V.Rho): V.Value {
        const clos_body = new V.Closure(gamma, this.body);
        return new V.Lambda(this.name, clos_body);
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Lambda) {
            this.body.alpha_equiv(
                other.body,
                context.add(this.name, other.name)
            );
        } else {
            throw new Error("Not structurally equiv Lambda");
        }
    }

    public override toString(): string {
        return `(λ (${this.name}) ${this.body.toString()})`;
    }
}

export class Appl extends Core {
    /**
     * @param func the operator
     * @param arg the operand
     */
    public constructor(
        public func: Core,
        public arg: Core
    ) { super(); }

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

    public override toString(): string {
        return `(${this.func.toString()} ${this.arg.toString()})`;
    }
}

/**
 * Convert a Rho into a Bound
 * @param gamma the runtime environment
 * @returns a list of all bound variables
 */
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

    public override toString(): string {
        return "U";
    }
}

// Data types

export type DatatypeParameter = { expr: Core, type: Core };

export class Constructor extends Core {
    public constructor(
        public name: Symbol,
        public args: I.List<DatatypeParameter>,
        public type: Datatype
    ) { super(); }

    public override eval(rho: V.Rho): V.Value {
        const args = this.args.map(({ expr, type }) => ({ expr: expr.eval(rho), type: type.eval(rho) }));
        const datatype = this.type.eval(rho) as V.Datatype;
        return new V.Constructor(this.name, args, datatype);
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Constructor) {
            if (this.name !== other.name)
                throw new Error("Names of constructors must match up");
            this.args.zipWith((a, b) => a.expr.alpha_equiv(b.expr, context), other.args);
        } else {
            throw new Error("Not structurally equiv Constructor");
        }
    }

    public override toString(): string {
        return `(${this.name} ${this.args.join(" ")})`;
    }
}

type Param = { name: Symbol, value: Core };

export class ConstructorInfo {
    public constructor(
        public parameters: I.List<Param>,
        public type: I.List<Core>
    ) { }

    public eval(rho: V.Rho): V.ConstructorInfo {
        const parameters = this.parameters.map(({ name, value }) => ({ name, value: value.eval(rho) }));
        const type = this.type.map(t => t.eval(rho));
        return new V.ConstructorInfo(parameters, type);
    }
}

export class Datatype extends Core {
    public constructor(
        public name: Symbol,
        public parameters: I.List<DatatypeParameter>,
        public indices: I.List<DatatypeParameter>,
        public constructors: I.Map<Symbol, ConstructorInfo>
    ) { super(); }

    public override eval(rho: V.Rho): V.Value {
        const parameters = Datatype.eval_parameters(this.parameters, rho);
        const indices = Datatype.eval_parameters(this.indices, rho);
        const constructors = this.constructors.map(c => c.eval(rho));
        return new V.Datatype(this.name, parameters, indices, constructors);
    }

    private static eval_parameters(parameters: I.List<DatatypeParameter>, rho: V.Rho): I.List<V.DatatypeParameter> {
        return parameters.map(({ expr, type }) => ({ expr: expr.eval(rho), type: type.eval(rho) }));
    }

    public override alpha_equiv(other: Core, _context: Renamings): void {
        if (!(other instanceof Datatype && this.name === other.name))
            throw new Error("Not structurally equiv Datatype");
    }

    public override toString(): string {
        return "";
    }
}

export class Arm {
    public constructor(
        public pattern: A.Pattern,
        public body: Core
    ) { }

    public alpha_equiv(other: Arm, context: Renamings): void {
        this.pattern.is_same(other.pattern);
        const new_context = this.pattern.extend_renamings(context, other.pattern);
        this.body.alpha_equiv(other.body, new_context);
    }

    public toString(): string {
        return `(${this.pattern.toString()} ${this.body.toString()})`;
    }
}

export class Match extends Core {
    public constructor(
        public target: Core,
        public arms: I.List<Arm>,
        public motive: V.Value
    ) { super(); }

    public override eval(rho: V.Rho): V.Value {
        const eval_target = this.target.eval(rho);
        if (eval_target instanceof V.Neutral) {
            const motive = new N.Normal(this.motive, new V.U());
            return new V.Neutral(this.motive, new N.Match(eval_target.neutral, this.arms, motive));
        } else {
            const matched_arm = this.arms.find(arm => arm.pattern.admits(eval_target));
            if (matched_arm) {
                const new_rho = matched_arm.pattern.extend_rho(rho, eval_target);
                return matched_arm.body.eval(new_rho);
            } else {
                throw new Error("Unexhaustive match");
            }
        }
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Match) {
            this.target.alpha_equiv(other.target, context);
            this.arms.zipWith((left, right) => left.alpha_equiv(right, context), other.arms);
        } else {
            throw new Error("Not structurally equiv Match");
        }
    }

    public override toString(): string {
        const arms = this.arms.map(arm => arm.toString()).join(" ");
        return `(match ${this.target.toString()} ${arms})`;
    }
}