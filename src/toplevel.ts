import * as E from "./expr.ts";
import * as C from "./core.ts";
import * as V from "./value.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";

type Symbol = string;
type TopLevelEntry = { name: Symbol; type: "Claim" | "Define"; value: V.Value };
export type Context = I.List<TopLevelEntry>;

/**
 * Abstract class for top-level constructs
 */
export interface TopLevel {
    /**
     * Evaluate a top-level statement given some context returning the updated context
     * @param gamma the top-level context so far
     */
    eval(gamma: Context): Context;
}

/**
 * Convert a toplevel context into an expression context
 * @param context the toplevel context
 * @returns the expression context
 */
function to_expr_env(context: Context): E.Context {
    return context.map<E.ContextEntry>(({ name, type, value }) => {
        if (type === "Claim") {
            return { name, type: "Claim", value };
        } else {
            const claim = context.find((x) => x.name === name && x.type === "Claim");
            if (claim) {
                return {
                    name,
                    type: "Define",
                    value: { value, type: claim.value },
                };
            } else {
                throw new Error(`Missing claim for define for ${name}`);
            }
        }
    });
}

/**
 * Concrete class for (define ...) statement
 */
export class Define implements TopLevel {
    public constructor(public name: Symbol, public value: E.Expr) {}

    /**
     * Check whether there is claim before this define and then check the definition's
     * body against the claimed type to obtain a core expression which can be evaluated and
     * put into the new context
     */
    public eval(gamma: Context): Context {
        const claim = gamma.find((e) => e.name === this.name && e.type === "Claim");
        const expr_env = to_expr_env(gamma);
        const core = this.value.check(expr_env, claim!.value);
        const value = core.eval(E.to_rho(expr_env));
        return gamma.push({ name: this.name, type: "Define", value });
    }
}

/**
 * Declare a variables type using (claim ...)
 */
export class Claim implements TopLevel {
    public constructor(public name: Symbol, public type: E.Expr) {}

    /**
     * Check whether the body is a type and then add it to the context
     */
    public eval(gamma: Context): Context {
        const expr_env = to_expr_env(gamma);
        const core = this.type.isType(expr_env);
        const value = core.eval(E.to_rho(expr_env));
        return gamma.push({ name: this.name, type: "Claim", value });
    }
}

/**
 * To make the language somewhat useful there is a construct to check whether something
 * type checks and it produces the correct value
 */
export class CheckSame implements TopLevel {
    public constructor(
        public type: E.Expr,
        public left: E.Expr,
        public right: E.Expr,
    ) {}

    /**
     * Evaluate the type, check the two expressions against that type and then check the values
     */
    public eval(gamma: Context): Context {
        const expr_env = to_expr_env(gamma);
        const rho = E.to_rho(expr_env);
        const type_value = this.type.isType(expr_env).eval(rho);
        const left_value = this.left.check(expr_env, type_value).eval(rho);
        const right_value = this.right.check(expr_env, type_value).eval(rho);

        const bound = C.to_bound(rho);
        left_value.same_value(rho, bound, type_value, right_value);

        return gamma;
    }
}

type Param = { name: Symbol, value: E.Expr };

export class Constructor {
    public constructor(
        public name: Symbol,
        public parameters: I.List<Param>,
        public ret_type: I.List<E.Expr>
    ) { }

    public to_core(): C.Core {
        const args = this.parameters.map(({ name }) => new C.Var(name));
        const constr: C.Core = new C.Constructor(this.name, args);
        return this.parameters.reduceRight((acc, { name }) => new C.Lambda(name, acc), constr);
    }

    public to_type(context: Context, datatype: C.Core): C.Core {
        const expr_env = to_expr_env(context);
        const param_types = this.parameters.map(({ name, value }) => ({ name, value: value.isType(expr_env) }));
        return param_types.reduce((acc, { name, value }) => new C.Pi(name, value, acc), datatype);
    }

    public to_constructor_type(context: Context, name: Symbol, ret_type_types: I.List<V.Value>): C.ConstructorType {
        const expr_env = to_expr_env(context);
        const fields = this.parameters
            .toOrderedMap()
            .mapEntries(([_, param]) => [param.name, param.value.isType(expr_env)]);
        const core_ret_type = this.ret_type.zipWith((v, t) => v.check(expr_env, t), ret_type_types);
        return new C.ConstructorType(fields, name, core_ret_type);
    }
}

export class Data implements TopLevel {
    public constructor(
        public name: Symbol,
        public parameters: I.List<Param>,
        public indices: I.List<Param>,
        public constructors: I.List<Constructor>
    ) { }

    private to_type(gamma: Context): C.Core {
        const expr_env = to_expr_env(gamma);
        return this.parameters
            .concat(this.indices)
            .map(({ name, value }) => ({ name, value: value.isType(expr_env) }))
            .reduceRight((acc, { name, value }) => new C.Pi(name, value, acc), new C.U());
    }

    private to_core(gamma: Context): C.Core {
        const expr_env = to_expr_env(gamma), rho = E.to_rho(expr_env);
        const ret_type_types = this.parameters
            .concat(this.indices)
            .map(({ value }) => value.isType(expr_env));
        const constrs = this.constructors
            .toMap()
            .mapEntries(([_, constr]) => [constr.name, constr.to_constructor_type(gamma, this.name, ret_type_types.map(t => t.eval(rho)))]);
        const body: C.Core = new C.Datatype(this.name, constrs, ret_type_types); 
        return this.parameters
            .concat(this.indices)
            .reduceRight((acc, { name }) => new C.Lambda(name, acc), body);
    }

    public eval(gamma: Context): Context {
        const expr_env = to_expr_env(gamma), rho = E.to_rho(expr_env);
        return this.constructors
            .reduce((env, constr) => env
                .push({ type: "Claim",  name: constr.name, value: constr.to_type(gamma, this.to_core(gamma)).eval(rho) })
                .push({ type: "Define", name: constr.name, value: constr.to_core().eval(rho) }), gamma)
            .push({ type: "Claim",  name: this.name, value: this.to_type(gamma).eval(rho) })
            .push({ type: "Define", name: this.name, value: this.to_core(gamma).eval(rho) });
    }
}