import * as C from "./core.ts";
import * as V from "./value.ts";
import * as N from "./neutral.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";
import * as A from "./pattern.ts";
import * as O from "./context.ts";

type Symbol = O.Symbol;

/**
 * The result of the synthesis judgement is a core expression and the type of that expression
 */
export type SynthResult = { type: V.Value; expr: C.Core };

/**
 * Evaluate a core expression to its normal under an expression context
 * @param core the core expression to evaluate
 * @param context the expression context
 * @returns the normal form of core
 */
function run_eval(core: C.Core, context: O.Gamma): V.Value {
    return core.eval(context.to_rho());
}

/**
 * Expr is the class that represents the "raw" abstract syntax tree.
 * Expressions can be compiled to the lower-level core Pie language after they
 * have been type-checked. Core expressions represent well-typed Pie programs, so
 * they must be result of either type checking or type synthesis.
 */
export abstract class Expr {
    abstract description: string;

    /**
     * Synthesise a type for this expression
     * @param _context the context to synthesise under
     * @returns the type and the core expression
     * @throws when synthesising a type is not possible, e.g. for lambdas
     */
    public synth(_context: O.Gamma): SynthResult {
        throw new Error(`Could not synthesize type for ${this.description}.`);
    }

    /**
     * Check whether this expression is a type, it is a specialised version of
     * checking whether an expression has type U
     * @param context the context to check under
     * @returns the core expression after type checking
     * @throws when the expression is not a type
     */
    public isType(context: O.Gamma): C.Core {
        return this.check(context, new V.U());
    }

    /**
     * Check whether this expression has a particular type
     * @param context the context to check under
     * @param against the type to check against
     * @returns the core expression after type checking
     * @throws when the expression is not of the given type
     */
    public check(context: O.Gamma, against: V.Value): C.Core {
        const { type, expr } = this.synth(context);
        const rho = context.to_rho();
        // console.log(against, expr, type);
        against.same_type(rho, rho.to_bound(), type);
        return expr;
    }
}

/**
 * The expressions are like inline type annotations
 */
export class The extends Expr {
    public description = "The expression";

    /**
     * @param type the annotated type
     * @param value the value the annotation is for
     */
    public constructor(
        public type: Expr,
        public value: Expr
    ) { super(); }

    /**
     * Synthesising a type for a the expression involves checking
     * whether the value has the annotated type and then returning
     * the annotated type and the compiled core expression
     */
    public override synth(context: O.Gamma): SynthResult {
        const type_core = this.type.isType(context);
        const type_value = run_eval(type_core, context);
        const value_core = this.value.check(context, type_value);
        return { type: type_value, expr: value_core };
    }
}

/**
 * Variables refer to bounded not-yet-defined values
 */
export class Var extends Expr {
    public description = "Variable";

    /**
     * @param name the name of the variable
     */
    public constructor(public name: Symbol) { super(); }

    /**
     * Synthesising a type for a variable requires the variable being either defined globally or locally,
     * which means checking the context for context entries with the variable's name and type Define or HasType.
     * If the variable has a proper entry, then return the type of the variable and a core expression for this var.
     * TODO: Verify whether shadowing works for type checking
     */
    public override synth(context: O.Gamma): SynthResult {
        // TODO
        const entries  = context.get_all(this.name);
        const define   = entries.findLast(entry => entry instanceof O.Define) as O.Define | undefined;
        const claim    = entries.findLast(entry => entry instanceof O.Claim) as O.Claim | undefined;
        const has_type = entries.findLast(entry => entry instanceof O.HasType) as O.HasType | undefined;
        const data     = entries.findLast(entry => entry instanceof O.Data) as O.Data | undefined;

        if (define && claim) {
            return { type: claim.type, expr: new C.Var(this.name) };
        } else if (has_type) {
            return { type: has_type.type, expr: new C.Var(this.name) };
        } else {
            throw new Error(`Cannot find undeclared symbol ${this.name}`);
        }
    }
}

// Atoms

/**
 * The expression type for the Atom type
 */
export class Atom extends Expr {
    public description = "Atom type";

    public override synth(_context: O.Gamma): SynthResult {
        return { type: new V.U(), expr: new C.Atom() };
    }

    public override isType(_context: O.Gamma): C.Core {
        return new C.Atom();
    }
}

/**
 * Tick expressions are the only Atoms, they consist of a tick mark (') and a name afterwards
 * A tick expression is only equal to other tick expressions with the same name. Atoms cannot
 * be eliminated
 */
export class Tick extends Expr {
    public description = "Tick expression";
    
    /**
     * @param name the name of the atom
     */
    public constructor(public name: Symbol) { super(); }

    /**
     * Synthesising a type for ticks is trivial: they are always Atoms 
     */
    public override synth(_context: O.Gamma): SynthResult {
        return { type: new V.Atom(), expr: new C.Tick(this.name) };
    }
}

// Pairs

/**
 * The Pair type constructor is a shorthand for a non-dependent sigma type
 */
export class Pair extends Expr {
    public description = "Pair type";

    /**
     * @param left the car of the sigma
     * @param right the cdr of the sigma
     */
    public constructor(
        public left: Expr,
        public right: Expr
    ) { super(); }

    /**
     * Checking whether a Pair is a type, involves simulating the underlying sigma type
     */
    public override isType(context: O.Gamma): C.Core {
        const core_A = this.left.isType(context);
        const fresh_x = context.fresh("x");
        const new_gamma = context.set(fresh_x, run_eval(core_A, context));
        const core_body = this.right.isType(new_gamma);
        return new C.Sigma(fresh_x, core_A, core_body);
    }

    /**
     * Since Pairs are just non-dependent sigma types, they are not included in core Pie.
     * This means that Pair expressions are compiled to Sigma types with fresh names
     */
    public override synth(context: O.Gamma): SynthResult {
        const core_A = this.left.check(context, new V.U());
        const core_D = this.right.check(context, new V.U());
        return {
            type: new V.U(),
            expr: new C.Sigma(context.fresh("x"), core_A, core_D),
        };
    }
}

/**
 * A sigma type is a dependent pair type, the value of the right-hand side of the pair
 * can depend on the value on the left-hand side. In expressions, Sigma holds any number
 * of parameters, but the core expression only allowes Sigmas with arity 2.
 */
export class Sigma extends Expr {
    public description = "Sigma expression";

    /**
     * @param params a list of parameters
     * @param base the right-most term which cannot be depended on
     */
    public constructor(
        public params: I.List<{ name: Symbol; value: Expr }>,
        public base: Expr,
    ) { super(); }

    public override synth(context: O.Gamma): SynthResult {
        const core = this.isType(context);
        return { type: new V.U(), expr: core };
    }

    /**
     * n-ary Sigma types are compiled to binary core Sigma types, so we use
     * recursion to compile and type check the inner Sigma types
     */
    public override isType(context: O.Gamma): C.Core {
        const A = this.params.first()!, rest = this.params.shift();
        const core_A = A.value.isType(context);
        const new_gamma = context.set(A.name, run_eval(core_A, context));
        if (rest.size) {
            const smaller = new Sigma(rest, this.base);
            const core_smaller = smaller.isType(new_gamma);
            return new C.Sigma(A.name, core_A, core_smaller);
        } else {
            const core_base = this.base.isType(new_gamma);
            return new C.Sigma(A.name, core_A, core_base);
        }
    }
}

/**
 * Cons is the only constructor for Sigma types, it can hold two pieces of data: one left and one right
 */
export class Cons extends Expr {
    public description = "Cons expression";

    /**
     * @param left the car of the sigma's value
     * @param right the cdr of the sigma's value
     */
    public constructor(
        public left: Expr,
        public right: Expr
    ) { super(); }

    /**
     * Checking whether a cons is Sigma requires replacing the left-hand value
     * of the cons into the type of the right-hand side, because Sigma's right-hand side is
     * dependent on the left-hand side
     */
    public override check(context: O.Gamma, against: V.Value): C.Core {
        if (against instanceof V.Sigma) {
            const { name, value: A, body: D } = against;
            const core_left = this.left.check(context, A);
            const replaced_D = D.instantiate(name, run_eval(core_left, context));
            const core_right = this.right.check(context, replaced_D);
            return new C.Cons(core_left, core_right);
        } else {
            throw new Error(`Cons expression cannot be of type ${against.description}`);
        }
    }
}

/**
 * Car is one of the two eliminators for Sigma types, it simply return the first element of a cons
 */
export class Car extends Expr {
    public description = "Car expression";
    
    /**
     * @param pair the pair to get the first element from
     */
    public constructor(public pair: Expr) { super(); }

    public override synth(context: O.Gamma): SynthResult {
        const { type, expr: core } = this.pair.synth(context);
        if (type instanceof V.Sigma) {
            return { type: type.value, expr: new C.Car(core) };
        } else {
            throw new Error(`Expected a Sigma type as argument to car, got ${type.description}`);
        }
    }
}

/**
 * Cdr is one of the two eliminators for Sigma types, it simply return the second element of a cons
 */
export class Cdr extends Expr {
    public description = "Cdr expression";
    
    /**
     * @param pair the pair to get the second element from
     */
    public constructor(public pair: Expr) { super(); }

    public override synth(context: O.Gamma): SynthResult {
        const { type, expr: core } = this.pair.synth(context);
        if (type instanceof V.Sigma) {
            // TODO: replace value with body and instatiate it with the car
            return { type: type.value, expr: new C.Cdr(core) };
        } else {
            throw new Error(`Expected a Sigma type as argument to cdr, got ${type.description}`);
        }
    }
}

// Functions

/**
 * Arrow is the non-dependent function type, similar to Pair it compiles to Pi in core expressions
 * but unlike Pair, Arrow is n-ary
 */
export class Arrow extends Expr {
    public description = "Arrow expression";

    /**
     * @param args the parameters and return type of the function
     */
    public constructor(public args: I.List<Expr>) { super(); }

    /**
     * Check whether an arrow is a type involves checking whether the first element
     * is a type and then recurse on the rest. This pattern can be seen throughout all
     * of the n-ary operators 
     */
    public override isType(context: O.Gamma): C.Core {
        const from = this.args.first()!, to = this.args.get(1), rest = this.args.skip(2);
        const core_from = from.isType(context);
        const fresh_x = context.fresh("x");
        if (to && rest.size) {
            const smaller = new Arrow(rest.insert(0, to));
            const new_gamma = context.set(fresh_x, run_eval(core_from, context));
            const core_smaller = smaller.isType(new_gamma);
            return new C.Pi(fresh_x, core_from, core_smaller);
        } else if (to) {
            const core_to = to.isType(context);
            return new C.Pi(fresh_x, core_from, core_to);
        } else {
            throw new Error("Expected at least two arguments to ->");
        }
    }

    /**
     * An arrow expression is compiled to (nested) Pi core expressions with fresh unused names
     */
    public override synth(context: O.Gamma): SynthResult {
        const from = this.args.first()!, to = this.args.get(1), rest = this.args.skip(2);
        const core_X = from.check(context, new V.U());
        const var_x = context.fresh("x");
        const new_gamma = context.set(var_x, run_eval(core_X, context));

        if (rest.size) {
            const core_R = new Arrow(rest).check(new_gamma, new V.U());
            return {
                type: new V.U(),
                expr: new C.Pi(var_x, core_X, core_R),
            };
        } else if (to) {
            const core_R = to.check(new_gamma, new V.U());
            return {
                type: new V.U(),
                expr: new C.Pi(var_x, core_X, core_R),
            };
        } else {
            throw new Error("Expected at least two arguments to ->");
        }
    }
}

/**
 * Pi is the n-ary dependent function type, which means that parameters can
 * be used as part of the types of other parameters or the return type
 */
export class Pi extends Expr {
    public description = "Pi expression";

    /**
     * @param params the list of parameters
     * @param base the return type of the function
     */
    public constructor(
        public params: I.List<{ name: Symbol; value: Expr }>,
        public base: Expr,
    ) { super(); }

    public override isType(context: O.Gamma): C.Core {
        const arg = this.params.first()!, rest = this.params.shift();
        const core_arg = arg.value.isType(context);
        const new_gamma = context.set(arg.name, run_eval(core_arg, context));
        if (rest.size) {
            const smaller = new Pi(rest, this.base);
            const core_smaller = smaller.isType(new_gamma);
            return new C.Pi(arg.name, core_arg, core_smaller);
        } else {
            const core_base = this.base.isType(new_gamma);
            return new C.Pi(arg.name, core_arg, core_base);
        }
    }

    public override synth(context: O.Gamma): SynthResult {
        const param = this.params.first()!, rest = this.params.shift();
        const core_X = param.value.check(context, new V.U());
        const new_gamma = context.set(param.name, run_eval(core_X, context));

        if (rest.size) {
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

/**
 * Lambdas are the way to create functions and they are the constructors for Pi and Arrow.
 */
export class Lambda extends Expr {
    public description = "Lambda abstraction";

    /**
     * @param params the names of the parameters
     * @param body the body of the lambda
     */
    public constructor(
        public params: I.List<Symbol>,
        public body: Expr
    ) { super(); }

    /**
     * To check a lambda against a type, we need to grab the first parameter
     * of the pi and assign the parameter into the context and check the body
     * of the lambda against the body of the pi
     */
    public override check(context: O.Gamma, against: V.Value): C.Core {
        if (against instanceof V.Pi) {
            const { value, body } = against;
            const param = this.params.first()!, rest = this.params.shift();
            const new_gamma = context.set(param, value);
            const new_against = body.instantiate(against.name, new V.Neutral(value, new N.Var(param)));

            if (rest.size) {
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

/**
 * Application of any number of arguments to a function
 */
export class Appl extends Expr {
    public description = "Function application";

    /**
     * @param func the operators
     * @param args the operands
     */
    public constructor(
        public func: Expr,
        public args: I.List<Expr>
    ) { super(); }

    /**
     * To synthesise a type for an application, we need to synthesise the type for the operator
     * and check whether the operand is of the type of the operator's parameter type
     */
    public override synth(context: O.Gamma): SynthResult {
        if (this.args.size > 1) {
            const args = this.args.skipLast(1);
            const appl = new Appl(this.func, args);
            const { type, expr: core_appl } = appl.synth(context) as {
                type: V.Pi,
                expr: C.Core
            };

            const arg = this.args.last()!;
            const core_arg = arg.check(context, type.value);

            return {
                type: type.body.instantiate(type.name, run_eval(core_arg, context)),
                expr: new C.Appl(core_appl, core_arg),
            };
        } else {
            const arg = this.args.first()!;
            const { type, expr: core_func } = this.func.synth(context);
            if (type instanceof V.Pi) {
                const core_arg = arg.check(context, type.value);

                return {
                    type: type.body.instantiate(type.name, run_eval(core_arg, context)),
                    expr: new C.Appl(core_func, core_arg),
                };
            } else {
                throw new Error("Can only apply to function types");
            }
        }
    }
}

/**
 * U is the universe type: the type of types
 */
export class U extends Expr {
    public description = "U type";

    public override isType(_context: O.Gamma): C.Core {
        return new C.U();
    }
}

export class Arm {
    public constructor(
        public pattern: A.Pattern,
        public body: Expr
    ) { }

    public check(context: O.Gamma, type: V.Value, against: V.Value): C.Arm {
        const new_context = this.pattern.extend_context(context, type);
        const core_body = this.body.check(new_context, against);
        return new C.Arm(this.pattern, core_body);
    }

    public synth(context: O.Gamma, type: V.Value): { type: V.Value, expr: C.Arm } {
        const new_context = this.pattern.extend_context(context, type);
        const { expr: core_body, type: type_body } = this.body.synth(new_context);
        return { expr: new C.Arm(this.pattern, core_body), type: type_body };
    }
}

export class Match extends Expr {
    public description = "match expression";

    public constructor(
        public target: Expr,
        public arms: I.List<Arm>
    ) { super(); }

    public override synth(context: O.Gamma): SynthResult {
        const { expr: core_target, type: type_target } = this.target.synth(context);
        const first_arm = this.arms.first()!, other_arms = this.arms.skip(1);
        const { expr: core_first_arm, type: type_body } = first_arm.synth(context, type_target);
        const core_arms = other_arms
            .map(arm => arm.check(context, type_target, type_body))
            .insert(0, core_first_arm);

        const patterns = this.arms.map(arm => arm.pattern);
        A.covers(patterns, type_target);

        return {
            expr: new C.Match(core_target, core_arms, type_body),
            type: type_body
        };
    }
}