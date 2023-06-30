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
export class Constructor {
    public constructor(
        public name: Symbol,
        public params: I.List<Param>,
        public index: number
    ) { }

    public to_sum_type(gamma: Context): C.Core {
        const expr_env = to_expr_env(gamma);
        return this.params
            .map(param => ({ name: param.name, type: param.type.isType(expr_env) }))
            .reduceRight((a, { name, type }) => a instanceof C.Core
                ? new C.Sigma(name, type, a)
                : new C.Sigma(name, type, a.type));
    }

    public to_pi_type(gamma: Context, data_type: C.Core): C.Core {
        const expr_env = to_expr_env(gamma);
        return this.params
            .map(param => ({ name: param.name, type: param.type.isType(expr_env) }))
            .reduceRight((a, { name, type }) => new C.Pi(name, type, a), data_type);
    }

    private static to_coproduct(index: number, max_variants: number, body: C.Core): C.Core {
        if (index === max_variants)
            body = new C.Inr(body);
        else
            body = new C.Inl(body);
        for (let i = 0; i < index; i++)
            body = new C.Inr(body);
        return body;
    }

    private static max_variants(record_type: C.Core): number {
        // Record type coproducts associate rightwards
        if (record_type instanceof C.Coproduct)
            return 1 + Constructor.max_variants(record_type.right);
        else return 0;
    }

    public to_function(gamma: Context, record_type: C.Core): C.Core {
        const bound = gamma.map(e => e.name);
        const variables = this.params.map(({ name }) => V.fresh(bound, name));
        const inner_body: C.Core = variables.map(v => new C.Var(v)).reduce((a, b) => new C.Cons(b, a));
        const coproduct_body = Constructor.to_coproduct(this.index, Constructor.max_variants(record_type), inner_body);
        return this.params.reduceRight((a, p) => new C.Lambda(p.name, a), coproduct_body);
    }
}

export class Data implements TopLevel {
    public constructor(
        public name: Symbol,
        public fields: I.List<Constructor>
    ) { }

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
            { name: `make-${construct.name}`, type: "Claim", value: construct.to_pi_type(gamma, core_record).eval(rho) },
            { name: `make-${construct.name}`, type: "Define", value: construct.to_function(gamma, core_record).eval(rho) }
        ]);
        return gamma.concat(constr_types);
    }
}