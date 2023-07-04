import * as E from "./expr.ts";
import * as V from "./value.ts";
import * as C from "./core.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";

type Symbol = string;

/**
 * The abstract class for patterns in a pattern matching arm
 */
export abstract class Pattern {
    /**
     * Add the variables to the context that this pattern introduces
     * @param context the original context
     */
    public abstract extend_context(context: E.Context): E.Context;

    /**
     * Check whether the pattern is correctly formulated and destructs a particular type,
     * i.e. the type exists and the parameters are covered
     * @param context the context of the match expression
     * @param against the expected type the pattern should destruct
     * @throws when the pattern is not valid and returns nothing when the pattern is valid
     */
    public abstract is_pattern(context: E.Context, against: V.Value): void;

    /**
     * Compile the pattern with a given body, this yields an expression ready for
     * use in ind-+
     * @param context the context of the match expression
     * @param body the compiled body of the arm the pattern is associated with
     */
    public abstract compile(context: E.Context, body: C.Core): C.Core;
}

/**
 * Concrete pattern class for patterns where we only match on the type and not on its contents
 */
export class CoproductPattern extends Pattern {
    /**
     * @param type the type to match against
     * @param name the name to give the matched value in the body of the arm
     */
    public constructor(
        public type: E.Expr,
        public name: Symbol
    ) { super(); }

    public override is_pattern(context: E.Context, against: V.Value): void {
        const core = this.type.isType(context);
        const rho = E.to_rho(context), bound = C.to_bound(rho);
        core.eval(rho).same_type(rho, bound, against);
    }

    public override extend_context(context: E.Context): E.Context {
        const variant_type = this.type.isType(context).eval(E.to_rho(context));
        return context.push({
            name: this.name,
            type: "HasType",
            value: variant_type
        });
    }

    public override compile(_context: E.Context, body: C.Core): C.Core {
        return new C.Lambda(this.name, body);
    }
}

/**
 * Concrete pattern class for patterns where we do match on contents as well as type
 */
export class SigmaPattern extends Pattern {
    /**
     * @param type the type to match against
     * @param params the names of the parameters of the underlying sigma type used in the body of the arm
     */
    public constructor(
        public type: E.Expr,
        public params: I.List<Symbol> // TODO: For dependent pattern matching this needs to be Expr[]
    ) { super(); }

    /**
     * Get all the parameters of a sigma type as core expressions
     * @param core the core representation of a sigma value
     * @returns the list of parameters in the sigma type as core expressions
     */
    private static sigma_fields(core: C.Core): I.List<C.Core> {
        if (core instanceof C.Sigma)
            return SigmaPattern.sigma_fields(core.body)
                .push(core.value);
        else
            return I.List([core]);
    }

    public override is_pattern(context: E.Context, against: V.Value): void {
        // Get the type of the constructor
        const core = this.type.isType(context);

        const rho = E.to_rho(context), bound = C.to_bound(rho);
        const value = core.eval(rho);
        value.same_type(rho, bound, against);

        // Check whether the arity is correct
        const members = SigmaPattern.sigma_fields(value.read_back_type(rho, bound)).size;
        if (this.params.size !== members)
            throw new Error(`Expected ${members} variables, but got ${this.params.size}`);
    }

    public override extend_context(context: E.Context): E.Context {
        const core = this.type.isType(context);
        const rho = E.to_rho(context), bound = C.to_bound(rho);
        const fields = SigmaPattern.sigma_fields(core.eval(rho).read_back_type(rho, bound));

        const added_context: E.Context = this.params.zipWith((name, field) =>
            ({ name, type: "HasType", value: field.eval(rho) }), fields);
        return context.concat(added_context);
    }

    /**
     * Compile field access based on indexing into the parameters of a sigma value
     * @param index the index of the field to compile access for starting from the left
     * @param sigma the value to compile the access to
     * @param type the type of the value of sigma parameter
     * @returns a series of cars and cdrs which leads to the index's position in sigma
     */
    private static compile_field_access(index: number, sigma: C.Core, type: C.Core): C.Core {
        const access = I.Range(0, index).reduce((acc, _) => new C.Cdr(acc), sigma);

        return index === SigmaPattern.sigma_fields(type).size - 1
            ? access
            : new C.Car(access);
    }

    public override compile(context: E.Context, body: C.Core): C.Core {
        const lambda = this.params.reduceRight((lambda, param) => new C.Lambda(param, lambda), body);
        const rho = E.to_rho(context), bound = C.to_bound(rho);
        const core = this.type.isType(context).eval(rho).read_back_type(rho, bound);

        const fresh_x = E.fresh(context, "x");
        const appls = this.params.reduce((appl, _, index) =>
            new C.Appl(appl, SigmaPattern.compile_field_access(index, new C.Var(fresh_x), core)), lambda);
        return new C.Lambda(fresh_x, appls);
    }
}

/**
 * An arm represents a pattern and an associated expression in a match expression
 */
export class Arm {
    /**
     * @param pattern the pattern
     * @param body the expression to execute when the pattern matches
     */
    public constructor(
        public pattern: Pattern,
        public body: E.Expr
    ) { }

    /**
     * Synthesise a type and compile a core expression for this arm
     * @param context the context of the match expression
     * @returns the synthesised type and core expression of the body given the pattern matches
     */
    public synth(context: E.Context): E.SynthResult {
        const new_context = this.pattern.extend_context(context);
        return this.body.synth(new_context);
    }

    /**
     * Check whether this arm has a particular type
     * @param context the context of the match expression
     * @param against the type to check against
     * @returns the core expression of the body if the body is of the given type
     * @throws when the type is not matched properly (up to αβ-equivalence)
     */
    public check(context: E.Context, against: V.Value): C.Core {
        const new_context = this.pattern.extend_context(context);
        return this.body.check(new_context, against);
    }

    /**
     * Compile the pattern to a core expression ready for use in an ind-+
     * @param context the context of the match expression
     * @param body the core expression of the body, note that the body needs to be
     * compiled separetely because the core expression needs either to be checked or synthesised
     * and we cannnot determine that in this method alone
     * @returns the core lambda expression for this arm
     */
    public compile(context: E.Context, body: C.Core): C.Core {
        return this.pattern.compile(context, body);
    }
}

/**
 * The expression class for a match expression.
 * Matches canonicalise to (nested) ind-+s in core expressions which is the
 * only way to match against coproduct types, the bodies are compiled
 * to lambdas that the ind-+ calls when the appropriate type is matched
 */
export class Match extends E.Expr {
    public description = "match expression";

    /**
     * @param target the expression to match against
     * @param arms the arms containing the patterns to match against
     */
    public constructor(
        public target: E.Expr,
        public arms: I.List<Arm>
    ) { super(); }

    public override synth(context: E.Context): E.SynthResult {
        const { expr: core_a, type: type_a } = this.target.synth(context);
        if (type_a instanceof V.Coproduct) {
            // Reorder arms, then do the type checking
            const arms = Match.reorder_arms(context, type_a, this.arms);
            return Match.synth_helper(context, arms, core_a, type_a);
        } else {
            throw new Error("Expected t in (match t c1 c2) to be A + B");
        }
    }

    /**
     * Collect all types from a coproduct from left to right
     * @param from the coproduct to collect types from
     * @returns a list of types
     */
    private static collect_variants(from: V.Value): I.List<V.Value> {
        return from instanceof V.Coproduct
            ? Match.collect_variants(from.left).concat(Match.collect_variants(from.right))
            : I.List([from]);
    }

    /**
     * Reorders the arms of the match expression such that they align
     * with the order of types in the coproduct type the target has
     * @param context the context of the match expression
     * @param type_a the type of the match's target
     * @param arms the list of unordered arms
     * @returns the list of ordered arms
     */
    private static reorder_arms(context: E.Context, type_a: V.Coproduct, arms: I.List<Arm>): I.List<Arm> {
        const variants = Match.collect_variants(type_a);
        const rho = E.to_rho(context), bound = C.to_bound(rho);
        return variants.map(variant => {
            const arm = arms.find(arm => {
                try {
                    arm.pattern.is_pattern(context, variant);
                    return true;
                } catch {
                    return false;
                }
            });

            if (arm)
                return arm;
            else
                throw new Error(`Match not exhaustive: missing pattern for ${variant.read_back_type(rho, bound).toString()}`);
        });
    }

    /**
     * Synthesises a type for and compiles a core expression for this match expression,
     * this includes all patterns the match expression has
     * @param context the context of the match expression
     * @param arms the reordered arms
     * @param core_a the core expression of the target
     * @param type_a the target's type
     * @returns the type and core expression for this match expression
     */
    private static synth_helper(context: E.Context, arms: I.List<Arm>, core_a: C.Core, type_a: V.Coproduct): E.SynthResult {
        const [first, ...rest] = arms;
        if (rest.length > 1) {
            const smaller_var = E.fresh(context, "smaller");
            const smaller = new Match(new E.Var(smaller_var), I.List(rest));
            // Datatypes coproducts associate rightwards, so we are safe to take right side to continue
            const smaller_context = context.push({ name: smaller_var, type: "HasType", value: type_a.right });
            const { expr: smaller_core, type: smaller_type } = smaller.synth(smaller_context);

            const first_body_core = first.check(context, smaller_type);

            return {
                expr: new C.IndCoproduct(
                    core_a,
                    smaller_type,
                    first.compile(context, first_body_core),
                    new C.Lambda(smaller_var, smaller_core)),
                type: smaller_type
            };
        } else if (rest.length === 1) {
            const second = rest[0];
            const { expr: core_left, type: type_left } = first.synth(context);
            const core_right = second.check(context, type_left);

            return {
                expr: new C.IndCoproduct(
                    core_a,
                    type_left,
                    first.compile(context, core_left),
                    second.compile(context, core_right)),
                type: type_left
            };
        } else {
            throw new Error("One arm");
        }
    }
}