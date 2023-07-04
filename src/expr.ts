import * as C from "./core.ts";
import * as V from "./value.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";
import * as N from "./neutral.ts";

type Symbol = string;
export type SynthResult = { type: V.Value; expr: C.Core };
type Define = { type: "Define"; value: { type: V.Value; value: V.Value } };
type Claim = { type: "Claim"; value: V.Value };
type HasType = { type: "HasType"; value: V.Value };
export type ContextEntry = { name: Symbol } & (Define | Claim | HasType);
export type Context = I.List<ContextEntry>;

export function fresh(
    context: Context,
    name: Symbol,
    attempt: number | undefined = undefined,
): Symbol {
    const altered = attempt ? name + attempt : name;
    if (context.find((x) => x.name === altered)) {
        return fresh(context, name, (attempt ?? 0) + 1);
    } else {
        return altered;
    }
}

export function to_rho(context: Context): V.Rho {
    return context
        .filter(({ type }) => type !== "Claim")
        .reduce((rho, { name, type, value }) => {
            if (type === "Define") {
                return rho.set(name, value.value);
            } else {
                return rho.set(name, new V.Neutral(value, new N.Var(name)));
            }
        }, I.Map() as V.Rho);
}

function run_eval(core: C.Core, context: Context): V.Value {
    const rho = to_rho(context);
    return core.eval(rho);
}

function push_local(name: Symbol, local: V.Value, context: Context): Context {
    return context.push({ name, type: "HasType", value: local });
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
        const rho = to_rho(context);
        against.same_type(rho, C.to_bound(rho), type);
        return expr;
    }
}

export class The extends Expr {
    public description = "The expression";
    public constructor(public type: Expr, public value: Expr) {
        super();
    }

    public override synth(context: Context): SynthResult {
        const type_core = this.type.isType(context);
        const type_value = run_eval(type_core, context);
        const value_core = this.value.check(context, type_value);
        return { type: type_value, expr: value_core };
    }
}

export class Var extends Expr {
    public description = "Variable";
    public constructor(public name: Symbol) {
        super();
    }

    public override synth(context: Context): SynthResult {
        const type = context.find(({ name, type }) =>
            name === this.name && (type === "Define" || type === "HasType")
        ) as { name: Symbol } & (HasType | Define);
        if (type) {
            const type_value = type.type === "Define" ? type.value.type : type.value;
            return { type: type_value, expr: new C.Var(this.name) };
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
    public constructor(public name: Symbol) {
        super();
    }

    public override synth(_context: Context): SynthResult {
        return { type: new V.Atom(), expr: new C.Tick(this.name) };
    }
}

// Pairs

export class Pair extends Expr {
    public description = "Pair type";
    public constructor(public left: Expr, public right: Expr) {
        super();
    }

    public override isType(context: Context): C.Core {
        const core_A = this.left.isType(context);
        const fresh_x = fresh(context, "x");
        const new_gamma = push_local(
            fresh_x,
            run_eval(core_A, context),
            context,
        );
        const core_body = this.right.isType(new_gamma);
        return new C.Sigma(fresh_x, core_A, core_body);
    }

    public override synth(context: Context): SynthResult {
        const core_A = this.left.check(context, new V.U());
        const core_D = this.right.check(context, new V.U());
        return {
            type: new V.U(),
            expr: new C.Sigma(fresh(context, "x"), core_A, core_D),
        };
    }
}

export class Sigma extends Expr {
    public description = "Sigma expression";
    public constructor(
        public params: { name: Symbol; value: Expr }[],
        public base: Expr,
    ) {
        super();
    }

    public override synth(context: Context): SynthResult {
        const core = this.isType(context);
        return { type: new V.U(), expr: core };
    }

    public override isType(context: Context): C.Core {
        const [A, ...rest] = this.params;
        const core_A = A.value.isType(context);
        const new_gamma = push_local(
            A.name,
            run_eval(core_A, context),
            context,
        );
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
    public constructor(public left: Expr, public right: Expr) {
        super();
    }

    public override check(context: Context, against: V.Value): C.Core {
        if (against instanceof V.Sigma) {
            const { name, value: A, body: D } = against;
            const core_left = this.left.check(context, A);
            const replaced_D = D.instantiate(
                name,
                run_eval(core_left, context),
            );
            const core_right = this.right.check(context, replaced_D);
            return new C.Cons(core_left, core_right);
        } else {
            throw new Error(
                `Cons expression cannot be of type ${against.description}`,
            );
        }
    }
}

export class Car extends Expr {
    public description = "Car expression";
    public constructor(public pair: Expr) {
        super();
    }

    public override synth(context: Context): SynthResult {
        const { type, expr: core } = this.pair.synth(context);
        if (type instanceof V.Sigma) {
            return { type: type.value, expr: new C.Car(core) };
        } else {
            throw new Error(
                `Expected a Sigma type as argument to car, got ${type.description}`,
            );
        }
    }
}

export class Cdr extends Expr {
    public description = "Cdr expression";
    public constructor(public pair: Expr) {
        super();
    }

    public override synth(context: Context): SynthResult {
        const { type, expr: core } = this.pair.synth(context);
        if (type instanceof V.Sigma) {
            return { type: type.value, expr: new C.Cdr(core) };
        } else {
            throw new Error(
                `Expected a Sigma type as argument to cdr, got ${type.description}`,
            );
        }
    }
}

// Functions

export class Arrow extends Expr {
    public description = "Arrow expression";
    public constructor(public args: Expr[]) {
        super();
    }

    public override isType(context: Context): C.Core {
        const [from, to, ...rest] = this.args;
        const core_from = from.isType(context);
        const fresh_x = fresh(context, "x");
        if (rest.length) {
            const smaller = new Arrow([to, ...rest]);
            const new_gamma = push_local(
                fresh_x,
                run_eval(core_from, context),
                context,
            );
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
        const new_gamma = push_local(var_x, run_eval(core_X, context), context);
        if (rest.length) {
            const core_R = new Arrow(rest).check(new_gamma, new V.U());
            return {
                type: new V.U(),
                expr: new C.Pi(var_x, core_X, core_R),
            };
        } else {
            const core_R = to.check(new_gamma, new V.U());
            return {
                type: new V.U(),
                expr: new C.Pi(var_x, core_X, core_R),
            };
        }
    }
}

export class Pi extends Expr {
    public description = "Pi expression";
    public constructor(
        public params: { name: Symbol; value: Expr }[],
        public base: Expr,
    ) {
        super();
    }

    public override isType(context: Context): C.Core {
        const [arg, ...rest] = this.params;
        const core_arg = arg.value.isType(context);
        const new_gamma = push_local(
            arg.name,
            run_eval(core_arg, context),
            context,
        );
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
        const new_gamma = push_local(
            param.name,
            run_eval(core_X, context),
            context,
        );
        if (rest.length) {
            const core_R = new Pi(rest, this.base).check(new_gamma, new V.U());
            return {
                type: new V.U(),
                expr: new C.Pi(param.name, core_X, core_R),
            };
        } else {
            const core_R = this.base.check(new_gamma, new V.U());
            return {
                type: new V.U(),
                expr: new C.Pi(param.name, core_X, core_R),
            };
        }
    }
}

export class Lambda extends Expr {
    public description = "Lambda abstraction";
    public constructor(public params: Symbol[], public body: Expr) {
        super();
    }

    public override check(context: Context, against: V.Value): C.Core {
        if (against instanceof V.Pi) {
            const { value, body } = against;
            const [param, ...rest] = this.params;
            const new_gamma = push_local(param, value, context);
            const new_against = body.instantiate(
                against.name,
                new V.Neutral(value, new N.Var(param)),
            );
            if (rest.length) {
                const smaller = new Lambda(rest, this.body);
                const core_smaller = smaller.check(new_gamma, new_against);
                return new C.Lambda(param, core_smaller);
            } else {
                const core_R = this.body.check(new_gamma, new_against);
                return new C.Lambda(param, core_R);
            }
        } else {
            throw new Error(
                `Expected Pi type for lambda expression, got ${against.description}`,
            );
        }
    }
}

export class Appl extends Expr {
    public description = "Function application";
    public constructor(public func: Expr, public args: Expr[]) {
        super();
    }

    public override synth(context: Context): SynthResult {
        if (this.args.length > 1) {
            const args = this.args.slice(0, this.args.length - 1);
            const appl = new Appl(this.func, args);
            const { type, expr: core_appl } = appl.synth(context) as {
                type: V.Pi;
                expr: C.Core;
            };

            const arg = this.args[this.args.length - 1];
            const core_arg = arg.check(context, type.value);

            return {
                type: type.body.instantiate(
                    type.name,
                    run_eval(core_arg, context),
                ),
                expr: new C.Appl(core_appl, core_arg),
            };
        } else {
            const arg = this.args[0];
            const { type, expr: core_func } = this.func.synth(context) as {
                type: V.Pi;
                expr: C.Core;
            };
            const core_arg = arg.check(context, type.value);

            return {
                type: type.body.instantiate(
                    type.name,
                    run_eval(core_arg, context),
                ),
                expr: new C.Appl(core_func, core_arg),
            };
        }
    }
}

export class U extends Expr {
    public description = "U type";

    public override isType(_context: Context): C.Core {
        return new C.U();
    }
}
