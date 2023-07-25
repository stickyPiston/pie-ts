import * as E from "./expr.ts";
import * as C from "./core.ts";
import * as V from "./value.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";

type Symbol = string;

/**
 * A top level context entry is either a define or a claim
 */
type TopLevelEntry = { name: Symbol; type: "Claim" | "Define"; value: V.Value };

/**
 * Since variables need to be claimed and defined we need to store the entries in a list
 * rather than a map
 */
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

/**
 * A constructor in a datatype definition
 */
export class Constructor {
    public constructor(
        public name: Symbol,
        public parameters: I.List<Param>,
        public type_name: Symbol,
        public type: I.List<E.Expr>
    ) { }

    /**
     * Create a core expression to introduce a constructor
     */
    public to_core(gamma: E.Context, datatype: C.Datatype): C.Core {
        const args = this.parameters.map(({ name, value }) => {
            gamma = gamma.push({ type: "HasType", name, value: new V.U() });
            return { expr: new C.Var(name), type: value.isType(gamma) };
        });
        const constr: C.Core = new C.Constructor(this.name, args, datatype);
        return this.parameters.reduceRight((acc, { name }) => new C.Lambda(name, acc), constr);
    }

    /**
     * Create the type for the function created from Constructor.to_core()
     * @param context the top level context of the data expression
     * @param datatype the core expression representing the parent datatype
     * @returns the core expression representing the the result of Constructor.to_core()
     */
    public to_type(gamma: E.Context, datatype: C.Core): C.Core {
        const param_types = this.parameters.map(({ name, value }) => {
            gamma = gamma.push({ type: "HasType", name, value: new V.U() });
            return { name, value: value.isType(gamma) };
        });
        return param_types.reduceRight((acc, { name, value }) => new C.Pi(name, value, acc), datatype);
    }

    public to_info(gamma: E.Context, parameters: I.List<V.Value>, indices: I.List<V.Value>): C.ConstructorInfo {
        return new C.ConstructorInfo(
            this.parameters.map(({ name, value }) => {
                gamma = gamma.push({ type: "HasType", name, value: new V.U() });
                return { name, value: value.isType(gamma) };
            }),
            this.type.zipWith((t, type) => t.check(gamma, type), parameters.concat(indices))
        );
    }
}

/**
 * A datatype definition
 */
export class Data implements TopLevel {
    public constructor(
        public name: Symbol,
        public parameters: I.List<Param>,
        public indices: I.List<Param>,
        public constructors: I.List<Constructor>
    ) { }

    /**
     * Create the type of the function generated by Data.to_core()
     * @param gamma the top level context of the data statement
     * @returns the pi expressions that represent the function creating this datatype
     */
    private to_type(gamma: E.Context): C.Core {
        return this.parameters
            .concat(this.indices)
            .map(({ name, value }) => ({ name, value: value.isType(gamma) }))
            .reduceRight((acc, { name, value }) => new C.Pi(name, value, acc), new C.U());
    }

    private to_datatype(gamma: E.Context, rho: V.Rho): C.Datatype {
        const parameters = Data.eval_parameters(this.parameters, gamma),
              indices = Data.eval_parameters(this.indices, gamma);
        const constructors = this.constructors.toMap().mapEntries(([_, c]) => [
            c.name,
            c.to_info(
                gamma,
                parameters.map(({ type }) => type.eval(rho)),
                indices.map(({ type }) => type.eval(rho))
            )]);
        return new C.Datatype(this.name, parameters, indices, constructors);
    }

    /**
     * Create the function that creates this datatype's type
     * @param gamma the top level context of the data statement
     * @returns the core expression for the function creating the datatype's type
     */
    private to_core(body: C.Core): C.Core {
        return this.parameters
            .concat(this.indices)
            .reduceRight((acc, { name }) => new C.Lambda(name, acc), body);
    }

    private static eval_parameters(parameters: I.List<Param>, gamma: E.Context): I.List<C.DatatypeParameter> {
        return parameters.map(({ name, value }) => ({ expr: new C.Var(name), type: value.isType(gamma) }));
    }

    /**
     * A datatype definition introduces the bindings for the type and for each of the constructors
     */
    public eval(context: Context): Context {
        if (!this.constructors.every(constr => constr.type_name === this.name))
            throw new Error("The constructors need to return an instance of the datatype");

        const gamma = to_expr_env(context), rho = E.to_rho(gamma);
        const datatype = this.to_datatype(gamma, rho);
        context = this.constructors
            .reduce((env, constr) => env
                .push({ type: "Claim",  name: constr.name, value: constr.to_type(gamma, datatype).eval(rho) })
                .push({ type: "Define", name: constr.name, value: constr.to_core(gamma, datatype).eval(rho) }), context)
            .push({ type: "Claim",  name: this.name, value: this.to_type(gamma).eval(rho) })
            .push({ type: "Define", name: this.name, value: this.to_core(datatype).eval(rho) });
        return context;
    }
}