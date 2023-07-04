import * as E from "./expr.ts";
import * as C from "./core.ts";
import * as V from "./value.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";

type Symbol = string;
type TopLevelEntry = { name: Symbol; type: "Claim" | "Define"; value: V.Value };
export type Context = I.List<TopLevelEntry>;
export interface TopLevel {
    eval(gamma: Context): Context;
}

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

export class Define implements TopLevel {
    public constructor(public name: Symbol, public value: E.Expr) {}

    public eval(gamma: Context): Context {
        const claim = gamma.find((e) => e.name === this.name && e.type === "Claim");
        const expr_env = to_expr_env(gamma);
        const core = this.value.check(expr_env, claim!.value);
        const value = core.eval(E.to_rho(expr_env));
        return gamma.push({ name: this.name, type: "Define", value });
    }
}

export class Claim implements TopLevel {
    public constructor(public name: Symbol, public type: E.Expr) {}

    public eval(gamma: Context) {
        const expr_env = to_expr_env(gamma);
        const core = this.type.isType(expr_env);
        const value = core.eval(E.to_rho(expr_env));
        return gamma.push({ name: this.name, type: "Claim", value });
    }
}

export class CheckSame implements TopLevel {
    public constructor(
        public type: E.Expr,
        public left: E.Expr,
        public right: E.Expr,
    ) {}

    public eval(gamma: Context) {
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

type Param = { name: Symbol, type: E.Expr };

/**
 * Represents a single constructor for a datatype
 */
export class Constructor {
    /**
     * @param name the name of the constructor
     * @param params a list of parameters
     * @param index the index into the list of constructors in the parent datatype
     */
    public constructor(
        public name: Symbol,
        public params: I.List<Param>,
        public index: number
    ) { }

    /**
     * Generates the sum type representing this constructor, this type canonically
     * represents this constructor as a value
     * @param gamma the parent datatype's context
     * @returns the sum type describing this constructor
     */
    public to_sum_type(gamma: Context): C.Core {
        const expr_env = to_expr_env(gamma);
        const [last, ...rest] = this.params
            .map(param => ({ name: param.name, type: param.type.isType(expr_env) }))
            .reverse();
        return rest.reduce((a, { name, type }) => new C.Sigma(name, type, a), last.type);
    }

    /**
     * Generate a pi type that represents a function that creates this
     * constructor's sumtype in the parent's datatype
     * @param gamma the parent datatype's context
     * @param data_type the datatype's full type
     * @returns a pi type that creates the parent's datatype using this constructor
     */
    public to_pi_type(gamma: Context, data_type: C.Core): C.Core {
        const expr_env = to_expr_env(gamma);
        return this.params
            .map(param => ({ name: param.name, type: param.type.isType(expr_env) }))
            .reduceRight((a, { name, type }) => new C.Pi(name, type, a), data_type);
    }

    /**
     * Generate the necessary inls and inrs around the given body to correctly represent the variant
     * @param index the index into the datatype's constructor list
     * @param max_variants the number of variants in the n-ary coproduct
     * @param body the body that the inls and inrs should wrap around
     * @returns a series of inls and inrs that represent the index into the parent's datatype
     */
    private static to_coproduct(index: number, max_variants: number, body: C.Core): C.Core {
        return I.Range(0, index).reduce(acc => new C.Inr(acc),
            index === max_variants
                ? body
                : new C.Inl(body));
    }

    /**
     * Count the number of variants in a coproduct type
     * @param record_type the coproduct type to count the variants of
     * @returns the number of variants
     */
    private static max_variants(record_type: C.Core): number {
        // Record type coproducts associate rightwards
        return record_type instanceof C.Coproduct
            ? 1 + Constructor.max_variants(record_type.right)
            : 0;
    }

    /**
     * Generate a lambda that creates an instance of this constructor
     * @param gamma the parent datatype's context
     * @param record_type the parent datatype's canonical representation
     * @returns a core expression to create this constructor
     */
    public to_function(gamma: Context, record_type: C.Core): C.Core {
        const bound = gamma.map(e => e.name);
        const inner_body: C.Core = this.params
            .map(({ name }) => new C.Var(V.fresh(bound, name)))
            .reduceRight((a, b) => new C.Cons(b, a));
        const coproduct_body = Constructor.to_coproduct(this.index, Constructor.max_variants(record_type), inner_body);
        return this.params.reduceRight((a, p) => new C.Lambda(p.name, a), coproduct_body);
    }
}

/**
 * Concrete toplevel class for datatype definition
 */
export class Data implements TopLevel {
    /**
     * @param name name of the datatype
     * @param fields a list of constructors
     */
    public constructor(
        public name: Symbol,
        public fields: I.List<Constructor>
    ) { }

    /**
     * Generate the canonicalised type that should be associated with the name of the datatype.
     * @param gamma the context of the datatype definition
     * @returns the constructors' types separated with coproducts
     */
    private to_type(gamma: Context): C.Core {
        return this.fields
            .map(field => field.to_sum_type(gamma))
            .reduceRight((a, t) => new C.Coproduct(t, a));
    }

    public eval(gamma: Context): Context {
        const expr_env = to_expr_env(gamma), rho = E.to_rho(expr_env);
        const core_record = this.to_type(gamma), record_type = core_record.eval(rho);
        gamma = gamma
            .push({ name: this.name, type: "Claim", value: new V.U() })
            .push({ name: this.name, type: "Define", value: record_type });

        const constr_types: Context = this.fields.flatMap(construct => [
            { name: construct.name, type: "Claim", value: new V.U() },
            { name: construct.name, type: "Define", value: construct.to_sum_type(gamma).eval(rho) },
            { name: `make-${construct.name}`, type: "Claim", value: construct.to_pi_type(gamma, core_record).eval(rho) },
            { name: `make-${construct.name}`, type: "Define", value: construct.to_function(gamma, core_record).eval(rho) }
        ]);
        return gamma.concat(constr_types);
    }
}