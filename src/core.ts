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

export class Nat extends Core {
    public override eval(_gamma: V.Rho): V.Value {
        return new V.Nat();
    }

    public override alpha_equiv(other: Core, _context: Renamings): void {
        if (!(other instanceof Nat)) {
            throw new Error("Not structurally equiv Nat");
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

export class Zero extends Core {
    public override eval(_gamma: V.Rho): V.Value {
        return new V.Zero();
    }

    public override alpha_equiv(other: Core, _context: Renamings): void {
        if (!(other instanceof Zero)) {
            throw new Error("Not structurally equiv Zero");
        }
    }
}

export class Add1 extends Core {
    public constructor(public num: Core) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        const eval_n = this.num.eval(gamma);
        return new V.Add1(eval_n);
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Add1) {
            this.num.alpha_equiv(other.num, context);
        } else {
            throw new Error("Not structurally equiv Add1");
        }
    }
}

export function to_bound(gamma: V.Rho): V.Bound {
    return gamma.keySeq().toList();
}

export class WhichNat extends Core {
    public constructor(
        public target: Core,
        public base_type: V.Value,
        public base_expr: Core,
        public add1: Core,
    ) {
        super();
    }

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
                new N.WhichNat(
                    target.neutral,
                    new N.Normal(base, this.base_type),
                    new N.Normal(step, pi_type.eval(env)),
                ),
            );
        } else if (target instanceof V.Zero) {
            return base;
        } else {
            return step;
        }
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof WhichNat) {
            this.target.alpha_equiv(other.target, context);
            this.base_expr.alpha_equiv(other.base_expr, context);
            this.add1.alpha_equiv(other.add1, context);
        } else {
            throw new Error("Not structurally equiv WhichNat");
        }
    }
}

export class IterNat extends Core {
    public constructor(
        public target: Core,
        public base_type: V.Value,
        public base_expr: Core,
        public add1: Core,
    ) {
        super();
    }
    public override eval(gamma: V.Rho): V.Value {
        const eval_target = this.target.eval(gamma);
        return this.do(
            gamma,
            eval_target,
            this.base_expr.eval(gamma),
            this.add1.eval(gamma),
        );
    }

    private do(
        gamma: V.Rho,
        n: V.Zero | V.Add1 | V.Neutral,
        base: V.Value,
        step: V.Value,
    ): V.Value {
        if (n instanceof V.Neutral) {
            const ty_name = V.fresh(to_bound(gamma), "ty");
            const pi_type = new Pi("x", new Var(ty_name), new Var(ty_name));
            const env = I.Map({ [ty_name]: this.base_type });
            return new V.Neutral(
                this.base_type,
                new N.IterNat(
                    n.neutral,
                    new N.Normal(base, this.base_type),
                    new N.Normal(step, pi_type.eval(env)),
                ),
            );
        } else if (n instanceof V.Zero) {
            return base;
        } else {
            return V.apply_many(step, this.do(gamma, n.n, base, step));
        }
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof IterNat) {
            this.target.alpha_equiv(other.target, context);
            this.base_expr.alpha_equiv(other.base_expr, context);
            this.add1.alpha_equiv(other.add1, context);
        } else {
            throw new Error("Not structurally equiv IterNat");
        }
    }
}

export class RecNat extends Core {
    public constructor(
        public target: Core,
        public base_type: V.Value,
        public base: Core,
        public add1: Core,
    ) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        const eval_target = this.target.eval(gamma);
        return this.do(
            gamma,
            eval_target,
            this.base.eval(gamma),
            this.add1.eval(gamma),
        );
    }

    private do(
        gamma: V.Rho,
        n: V.Add1 | V.Zero | V.Neutral,
        base: V.Value,
        step: V.Value,
    ): V.Value {
        if (n instanceof V.Neutral) {
            const ty_name = V.fresh(to_bound(gamma), "ty");
            const pi_type = new Pi(
                "n",
                new Nat(),
                new Pi("x", new Var(ty_name), new Var(ty_name)),
            );
            const env = I.Map({ [ty_name]: this.base_type });
            return new V.Neutral(
                this.base_type,
                new N.RecNat(
                    n.neutral,
                    new N.Normal(base, this.base_type),
                    new N.Normal(step, pi_type.eval(env)),
                ),
            );
        } else if (n instanceof V.Zero) {
            return base;
        } else {
            return V.apply_many(step, n.n, this.do(gamma, n.n, base, step));
        }
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof RecNat) {
            this.target.alpha_equiv(other.target, context);
            this.base.alpha_equiv(other.base, context);
            this.add1.alpha_equiv(other.add1, context);
        } else {
            throw new Error("Not structurally equiv RecNat");
        }
    }
}

export class IndNat extends Core {
    public constructor(
        public target: Core,
        public motive: Core,
        public base_expr: Core,
        public add1: Core,
    ) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        return this.do(
            gamma,
            this.target.eval(gamma),
            this.motive.eval(gamma),
            this.base_expr.eval(gamma),
            this.add1.eval(gamma),
        );
    }

    private do(
        gamma: V.Rho,
        n: V.Add1 | V.Zero | V.Neutral,
        motive: V.Value,
        base: V.Value,
        step: V.Value,
    ): V.Value {
        if (n instanceof V.Neutral) {
            const n_name = V.fresh(to_bound(gamma), "n");
            const mot_name = V.fresh(to_bound(gamma), "mot");
            const step_type = new Pi(
                n_name,
                new Nat(),
                new Pi(
                    "x",
                    new Appl(new Var(mot_name), new Var(n_name)),
                    new Appl(new Var(mot_name), new Add1(new Var(n_name))),
                ),
            );
            const env = I.Map({ [mot_name]: motive });
            const mot_type = new V.Pi(
                "n",
                new V.Nat(),
                new V.Closure(gamma, new U()),
            );
            return new V.Neutral(
                V.apply_many(motive, n),
                new N.IndNat(
                    n.neutral,
                    new N.Normal(motive, mot_type),
                    new N.Normal(base, V.apply_many(motive, new V.Zero())),
                    new N.Normal(step, step_type.eval(env)),
                ),
            );
        } else if (n instanceof V.Zero) {
            return base;
        } else {
            return V.apply_many(
                step,
                n.n,
                this.do(gamma, n.n, motive, base, step),
            );
        }
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof IndNat) {
            this.target.alpha_equiv(other.target, context);
            this.motive.alpha_equiv(other.motive, context);
            this.base_expr.alpha_equiv(other.base_expr, context);
            this.add1.alpha_equiv(other.add1, context);
        } else {
            throw new Error("Not structurally equiv IndNat");
        }
    }
}

export class List extends Core {
    public constructor(public e: Core) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        const eval_e = this.e.eval(gamma);
        return new V.List(eval_e);
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof List) {
            this.e.alpha_equiv(other.e, context);
        } else {
            throw new Error("Not structurally equiv List");
        }
    }
}

export class Nil extends Core {
    public override eval(_gamma: V.Rho): V.Value {
        return new V.Nil();
    }

    public override alpha_equiv(other: Core, _context: Renamings): void {
        if (!(other instanceof Nil)) {
            throw new Error("Not structurally equiv Nil");
        }
    }
}

export class ListCons extends Core {
    public constructor(public head: Core, public tail: Core) {
        super();
    }
    public override eval(gamma: V.Rho): V.Value {
        const eval_head = this.head.eval(gamma);
        const eval_tail = this.tail.eval(gamma);
        return new V.ListCons(eval_head, eval_tail);
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof ListCons) {
            this.head.alpha_equiv(other.head, context);
            this.tail.alpha_equiv(other.tail, context);
        } else {
            throw new Error("Not structurally equiv ListCons");
        }
    }
}

export class RecList extends Core {
    public constructor(
        public target: Core,
        public nil_type: V.Value,
        public core_nil: Core,
        public cons: Core,
    ) {
        super();
    }
    public override eval(gamma: V.Rho): V.Value {
        const eval_target = this.target.eval(gamma);
        const eval_base = this.core_nil.eval(gamma);
        const eval_step = this.cons.eval(gamma);
        return this.do(gamma, eval_target, eval_base, eval_step);
    }

    private do(
        gamma: V.Rho,
        target: V.ListCons | V.Nil | V.Neutral,
        base: V.Value,
        step: V.Value,
    ): V.Value {
        if (target instanceof V.Neutral) {
            const list_type = target.type as V.List;
            const E = V.fresh(to_bound(gamma), "E");
            const X = V.fresh(to_bound(gamma), "X");
            const step_type = new Pi(
                "head",
                new Var(E),
                new Pi(
                    "tail",
                    new List(new Var(E)),
                    new Pi("so-far", new Var(X), new Var(X)),
                ),
            );
            const env = I.Map({ [E]: list_type.e, [X]: this.nil_type });
            return new V.Neutral(
                this.nil_type,
                new N.RecList(
                    target.neutral,
                    new N.Normal(base, this.nil_type),
                    new N.Normal(step, step_type.eval(env)),
                ),
            );
        } else if (target instanceof V.Nil) {
            return base;
        } else {
            return V.apply_many(
                step,
                target.head,
                target.tail,
                this.do(gamma, target.tail, base, step),
            );
        }
    }

    public override alpha_equiv(other: Core, context: Renamings) {
        if (other instanceof RecList) {
            this.target.alpha_equiv(other.target, context);
            this.core_nil.alpha_equiv(other.core_nil, context);
            this.cons.alpha_equiv(other.cons, context);
        } else {
            throw new Error("Not structurally equiv RecList");
        }
    }
}

export class IndList extends Core {
    public constructor(
        public target: Core,
        public motive: Core,
        public base: Core,
        public step: Core,
    ) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        const eval_target = this.target.eval(gamma);
        const eval_motive = this.motive.eval(gamma);
        const eval_base = this.base.eval(gamma);
        const eval_step = this.step.eval(gamma);
        return this.do(gamma, eval_target, eval_motive, eval_base, eval_step);
    }

    private do(
        gamma: V.Rho,
        target: V.ListCons | V.Nil | V.Neutral,
        motive: V.Value,
        base: V.Value,
        step: V.Value,
    ): V.Value {
        if (target instanceof V.Neutral) {
            const list_type = target.type as V.List;
            const E = V.fresh(to_bound(gamma), "E");
            const mot = V.fresh(to_bound(gamma), "mot");
            const step_type = new Pi(
                "e",
                new Var(E),
                new Pi(
                    "es",
                    new List(new Var(E)),
                    new Pi(
                        "so-far",
                        new Appl(new Var(mot), new Var("es")),
                        new Appl(
                            new Var(mot),
                            new ListCons(new Var("e"), new Var("es")),
                        ),
                    ),
                ),
            );
            const mot_type = new Pi("list", new List(new Var(E)), new U());
            const env = I.Map({ [E]: list_type.e, [mot]: motive });
            return new V.Neutral(
                V.apply_many(motive, target),
                new N.IndList(
                    target.neutral,
                    new N.Normal(motive, mot_type.eval(env)),
                    new N.Normal(base, V.apply_many(motive, new V.Nil())),
                    new N.Normal(step, step_type.eval(env)),
                ),
            );
        } else if (target instanceof V.Nil) {
            return base;
        } else {
            return V.apply_many(
                step,
                target.head,
                target.tail,
                this.do(gamma, target.tail, motive, base, step),
            );
        }
    }

    public override alpha_equiv(other: Core, context: Renamings) {
        if (other instanceof IndList) {
            this.target.alpha_equiv(other.target, context);
            this.motive.alpha_equiv(other.motive, context);
            this.base.alpha_equiv(other.base, context);
            this.step.alpha_equiv(other.step, context);
        } else {
            throw new Error("Not structurally equiv IndList");
        }
    }
}

export class Vec extends Core {
    public constructor(public e: Core, public ell: Core) {
        super();
    }
    public override eval(gamma: V.Rho): V.Value {
        const eval_e = this.e.eval(gamma);
        const eval_ell = this.ell.eval(gamma);
        return new V.Vec(eval_e, eval_ell);
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Vec) {
            this.e.alpha_equiv(other.e, context);
            this.ell.alpha_equiv(other.ell, context);
        } else {
            throw new Error("Not structurally equiv Vec");
        }
    }
}

export class VecNil extends Core {
    public override eval(_gamma: V.Rho): V.Value {
        return new V.VecNil();
    }

    public override alpha_equiv(other: Core, _context: Renamings): void {
        if (!(other instanceof VecNil)) {
            throw new Error("Not structurally equiv VecNil");
        }
    }
}

export class VecCons extends Core {
    public constructor(public head: Core, public tail: Core) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        const eval_head = this.head.eval(gamma);
        const eval_tail = this.tail.eval(gamma);
        return new V.VecCons(eval_head, eval_tail);
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof VecCons) {
            this.head.alpha_equiv(other.head, context);
            this.tail.alpha_equiv(other.tail, context);
        } else {
            throw new Error("Not structurally equiv VecCons");
        }
    }
}

export class Head extends Core {
    public constructor(public vec: Core) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        const eval_vec = this.vec.eval(gamma) as V.VecCons;
        return eval_vec.head;
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Head) {
            this.vec.alpha_equiv(other.vec, context);
        } else {
            throw new Error("Not structurally equiv Head");
        }
    }
}

export class Tail extends Core {
    public constructor(public vec: Core) {
        super();
    }
    public override eval(gamma: V.Rho): V.Value {
        const eval_vec = this.vec.eval(gamma) as V.VecCons;
        return eval_vec.tail;
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Tail) {
            this.vec.alpha_equiv(other.vec, context);
        } else {
            throw new Error("Not structurally equiv Tail");
        }
    }
}

export class IndVec extends Core {
    public constructor(
        public ell: Core,
        public target: Core,
        public motive: Core,
        public base: Core,
        public step: Core,
    ) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        const eval_ell = this.ell.eval(gamma);
        const eval_target = this.target.eval(gamma);
        const eval_motive = this.motive.eval(gamma);
        const eval_base = this.base.eval(gamma);
        const eval_step = this.step.eval(gamma);
        return this.do(
            gamma,
            eval_ell,
            eval_target,
            eval_motive,
            eval_base,
            eval_step,
        );
    }

    private mot_type(E: V.Value): V.Value {
        return new Pi(
            "k",
            new Nat(),
            new Pi("es", new Vec(new Var("E"), new Var("k")), new U()),
        )
            .eval(I.Map({ E }));
    }

    private step_type(E: V.Value, motive: V.Value): V.Value {
        return new Pi(
            "k",
            new Nat(),
            new Pi(
                "e",
                new Var("E"),
                new Pi(
                    "es",
                    new Vec(new Var("E"), new Var("k")),
                    new Pi(
                        "so-far",
                        new Appl(
                            new Appl(new Var("motive"), new Var("k")),
                            new Var("es"),
                        ),
                        new Appl(
                            new Appl(new Var("motive"), new Add1(new Var("k"))),
                            new VecCons(new Var("e"), new Var("es")),
                        ),
                    ),
                ),
            ),
        )
            .eval(I.Map({ E, motive }));
    }

    private do(
        gamma: V.Rho,
        ell: V.Add1 | V.Zero | V.Neutral,
        target: V.VecCons | V.VecNil | V.Neutral,
        motive: V.Value,
        base: V.Value,
        step: V.Value,
    ): V.Value {
        if (ell instanceof V.Neutral && target instanceof V.Neutral) {
            const E = (target.type as V.Vec).e;
            const mot_type = this.mot_type(E);
            const step_type = this.step_type(E, motive);
            return new V.Neutral(
                V.apply_many(motive, ell, target),
                new N.IndVecEllVec(
                    ell.neutral,
                    target.neutral,
                    new N.Normal(motive, mot_type),
                    new N.Normal(
                        base,
                        V.apply_many(motive, new V.Zero(), new V.VecNil()),
                    ),
                    new N.Normal(step, step_type),
                ),
            );
        } else if (target instanceof V.Neutral) {
            const E = (target.type as V.Vec).e;
            const mot_type = this.mot_type(E);
            const step_type = this.step_type(E, motive);
            return new V.Neutral(
                V.apply_many(motive, ell, target),
                new N.IndVecVec(
                    new N.Normal(ell, new V.Nat()),
                    target.neutral,
                    new N.Normal(motive, mot_type),
                    new N.Normal(
                        base,
                        V.apply_many(motive, new V.Zero(), new V.VecNil()),
                    ),
                    new N.Normal(step, step_type),
                ),
            );
            // Technically the target check is not necessary, but typescript requires
            // it to allow accessing members of target
        } else if (ell instanceof V.Add1 && target instanceof V.VecCons) {
            return V.apply_many(
                step,
                ell,
                target.head,
                target.tail,
                this.do(gamma, ell.n, target.tail, motive, base, step),
            );
        } else {
            return base;
        }
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof IndVec) {
            this.ell.alpha_equiv(other.ell, context);
            this.target.alpha_equiv(other.target, context);
            this.motive.alpha_equiv(other.motive, context);
            this.base.alpha_equiv(other.base, context);
            this.step.alpha_equiv(other.step, context);
        } else {
            throw new Error("Not structurally equiv IndVec");
        }
    }
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

export class Equal extends Core {
    public constructor(public X: Core, public from: Core, public to: Core) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        const eval_X = this.X.eval(gamma);
        const eval_from = this.from.eval(gamma);
        const eval_to = this.to.eval(gamma);
        return new V.Equal(eval_X, eval_from, eval_to);
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Equal) {
            this.from.alpha_equiv(other.from, context);
            this.to.alpha_equiv(other.to, context);
        } else {
            throw new Error("Not structurally equiv Equal");
        }
    }
}

export class Same extends Core {
    public constructor(public mid: Core) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        return new V.Same(this.mid.eval(gamma));
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Same) {
            this.mid.alpha_equiv(other.mid, context);
        } else {
            throw new Error("Not structurally equiv Same");
        }
    }
}

export class Symm extends Core {
    public constructor(public t: Core) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        const eval_t = this.t.eval(gamma);
        if (eval_t instanceof V.Neutral) {
            return new V.Neutral(
                eval_t.type,
                new N.Symm(eval_t.neutral),
            );
        } else {
            return eval_t;
        }
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Symm) {
            this.t.alpha_equiv(other.t, context);
        } else {
            throw new Error("Not structurally equiv Symm");
        }
    }
}

export class Cong extends Core {
    public constructor(public Y: Core, public target: Core, public func: Core) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        const eval_target = this.target.eval(gamma);
        const eval_func = this.func.eval(gamma);
        const eval_Y = this.Y.eval(gamma);
        if (eval_target instanceof V.Neutral) {
            const type = eval_target.type as V.Equal;
            const func_type = new Pi("x", new Var("X"), new Var("Y"))
                .eval(I.Map({ X: type.X, Y: eval_Y }));
            return new V.Neutral(
                eval_target.type,
                new N.Cong(
                    eval_target.neutral,
                    new N.Normal(eval_func, func_type),
                ),
            );
        } else {
            return new V.Same(V.apply_many(eval_func, eval_target));
        }
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Cong) {
            this.target.alpha_equiv(other.target, context);
            this.func.alpha_equiv(other.func, context);
        } else {
            throw new Error("Not structurally equiv Cong");
        }
    }
}

export class Replace extends Core {
    public constructor(
        public target: Core,
        public motive: Core,
        public base: Core,
    ) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        const eval_target = this.target.eval(gamma);
        const eval_base = this.base.eval(gamma);
        if (eval_target instanceof V.Neutral) {
            const eval_motive = this.motive.eval(gamma);
            const ty = eval_target.type as V.Equal;
            return new V.Neutral(
                V.apply_many(eval_motive, ty.to),
                new N.Replace(
                    eval_target.neutral,
                    new N.Normal(
                        eval_motive,
                        new V.Pi(
                            "x",
                            ty.X,
                            new V.Closure(I.Map() as V.Rho, new U()),
                        ),
                    ),
                    new N.Normal(eval_base, V.apply_many(eval_motive, ty.from)),
                ),
            );
        } else {
            return eval_base;
        }
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Replace) {
            this.target.alpha_equiv(other.target, context);
            this.motive.alpha_equiv(other.motive, context);
            this.base.alpha_equiv(other.base, context);
        } else {
            throw new Error("Not structurally equiv Replace");
        }
    }
}

export class Trans extends Core {
    public constructor(public left: Core, public right: Core) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        const eval_left = this.left.eval(gamma);
        const eval_right = this.right.eval(gamma);
        if (eval_left instanceof V.Neutral && eval_right instanceof V.Neutral) {
            const tyl = eval_left.type as V.Equal;
            const tyr = eval_right.type as V.Equal;
            return new V.Neutral(
                new V.Equal(tyl.X, tyl.from, tyr.to),
                new N.TransLeftRight(eval_left.neutral, eval_right.neutral),
            );
        } else if (eval_left instanceof V.Neutral) {
            const ty = eval_left.type as V.Equal;
            return new V.Neutral(
                new V.Equal(ty.X, ty.from, eval_right),
                new N.TransLeft(
                    eval_left.neutral,
                    new N.Normal(
                        eval_right,
                        new V.Equal(ty.X, eval_right, eval_right),
                    ),
                ),
            );
        } else if (eval_right instanceof V.Neutral) {
            const ty = eval_right.type as V.Equal;
            return new V.Neutral(
                new V.Equal(ty.X, eval_left, ty.to),
                new N.TransRight(
                    new N.Normal(
                        eval_left,
                        new V.Equal(ty.X, eval_left, eval_left),
                    ),
                    eval_right.neutral,
                ),
            );
        } else {
            return eval_left;
        }
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Trans) {
            this.left.alpha_equiv(other.left, context);
            this.right.alpha_equiv(other.right, context);
        } else {
            throw new Error("Not structurally equiv Trans");
        }
    }
}

export class IndEqual extends Core {
    public constructor(
        public target: Core,
        public motive: Core,
        public base: Core,
    ) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        const eval_target = this.target.eval(gamma);
        const eval_base = this.base.eval(gamma);
        if (eval_target instanceof V.Neutral) {
            const ty = eval_target.type as V.Equal;
            const eval_motive = this.motive.eval(gamma);
            const motive_ty = new Pi(
                "x",
                new Var("A"),
                new Pi(
                    "_",
                    new Equal(new Var("A"), new Var("from"), new Var("x")),
                    new U(),
                ),
            )
                .eval(I.Map({ A: ty.X, from: ty.from }));
            return new V.Neutral(
                V.apply_many(eval_motive, ty.to, eval_target),
                new N.IndEqual(
                    eval_target.neutral,
                    new N.Normal(eval_motive, motive_ty),
                    new N.Normal(
                        eval_base,
                        V.apply_many(eval_motive, ty.from, new V.Same(ty.from)),
                    ),
                ),
            );
        } else {
            return eval_base;
        }
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof IndEqual) {
            this.target.alpha_equiv(other.target, context);
            this.motive.alpha_equiv(other.motive, context);
            this.base.alpha_equiv(other.base, context);
        } else {
            throw new Error("Not structurally equiv IndEqual");
        }
    }
}

export class Either extends Core {
    public constructor(public left: Core, public right: Core) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        const eval_left = this.left.eval(gamma);
        const eval_right = this.right.eval(gamma);
        return new V.Either(eval_left, eval_right);
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Either) {
            this.left.alpha_equiv(other.left, context);
            this.right.alpha_equiv(other.right, context);
        } else {
            throw new Error("Not structurally equiv Either");
        }
    }
}

export class Left extends Core {
    public constructor(public value: Core) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        return new V.Left(this.value.eval(gamma));
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Left) {
            this.value.alpha_equiv(other.value, context);
        } else {
            throw new Error("Not structurally equiv Left");
        }
    }
}

export class Right extends Core {
    public constructor(public value: Core) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        return new V.Right(this.value.eval(gamma));
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof Right) {
            this.value.alpha_equiv(other.value, context);
        } else {
            throw new Error("Not structurally equiv Right");
        }
    }
}

export class IndEither extends Core {
    public constructor(
        public target: Core,
        public motive: Core,
        public left: Core,
        public right: Core,
    ) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        const eval_target = this.target.eval(gamma);
        if (eval_target instanceof V.Neutral) {
            const ty = eval_target.type as V.Either;
            const eval_motive = this.motive.eval(gamma);
            const eval_left = this.left.eval(gamma);
            const eval_right = this.right.eval(gamma);
            return new V.Neutral(
                V.apply_many(eval_motive, eval_target),
                new N.IndEither(
                    eval_target.neutral,
                    new N.Normal(
                        eval_motive,
                        new V.Pi(
                            "x",
                            ty,
                            new V.Closure(I.Map({}) as V.Rho, new U()),
                        ),
                    ),
                    new N.Normal(
                        eval_left,
                        new V.Pi(
                            "l",
                            ty.left,
                            new V.Closure(
                                I.Map({ mot: eval_motive }) as V.Rho,
                                new Appl(
                                    new Var("mot"),
                                    new Left(new Var("l")),
                                ),
                            ),
                        ),
                    ),
                    new N.Normal(
                        eval_right,
                        new V.Pi(
                            "r",
                            ty.right,
                            new V.Closure(
                                I.Map({ mot: eval_motive }) as V.Rho,
                                new Appl(
                                    new Var("mot"),
                                    new Right(new Var("r")),
                                ),
                            ),
                        ),
                    ),
                ),
            );
        } else if (eval_target instanceof V.Left) {
            return V.apply_many(this.left.eval(gamma), eval_target);
        } else {
            return V.apply_many(this.right.eval(gamma), eval_target);
        }
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof IndEither) {
            this.target.alpha_equiv(other.target, context);
            this.motive.alpha_equiv(other.motive, context);
            this.left.alpha_equiv(other.left, context);
            this.right.alpha_equiv(other.right, context);
        } else {
            throw new Error("Not structurally equiv IndEither");
        }
    }
}

export class Trivial extends Core {
    public override eval(_gamma: V.Rho): V.Value {
        return new V.Trivial();
    }

    public override alpha_equiv(other: Core, _context: Renamings): void {
        if (!(other instanceof Trivial)) {
            throw new Error("Not structurally equiv Trivial");
        }
    }
}

export class Sole extends Core {
    public override eval(_gamma: V.Rho): V.Value {
        return new V.Sole();
    }

    public override alpha_equiv(other: Core, _context: Renamings): void {
        if (!(other instanceof Sole)) {
            throw new Error("Not structurally equiv Sole");
        }
    }
}

export class Absurd extends Core {
    public override eval(_gamma: V.Rho): V.Value {
        return new V.Absurd();
    }

    public override alpha_equiv(other: Core, _context: Renamings): void {
        if (!(other instanceof Absurd)) {
            throw new Error("Not structurally equiv Absurd");
        }
    }
}

export class IndAbsurd extends Core {
    public constructor(public target: Core, public motive: Core) {
        super();
    }

    public override eval(gamma: V.Rho): V.Value {
        const eval_motive = this.motive.eval(gamma);
        const eval_target = this.target.eval(gamma) as V.Neutral;
        return new V.Neutral(
            eval_motive,
            new N.IndAbsurd(
                eval_target.neutral,
                new N.Normal(eval_motive, new V.U()),
            ),
        );
    }

    public override alpha_equiv(other: Core, context: Renamings): void {
        if (other instanceof IndAbsurd) {
            this.target.alpha_equiv(other.target, context);
            this.motive.alpha_equiv(other.motive, context);
        } else {
            throw new Error("Not structurally equiv IndAbsurd");
        }
    }
}
