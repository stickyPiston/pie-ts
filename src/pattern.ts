import * as E from "./expr.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";
import * as V from "./value.ts";
import * as C from "./core.ts";
import * as N from "./neutral.ts";

type Symbol = string;

export abstract class Pattern {
    public abstract admits(against: V.Value): boolean;

    public abstract extend_context(context: E.Context, type: V.Value): E.Context;
    public abstract extend_rho(context: V.Rho, value: V.Value): V.Rho;
    public abstract extend_renamings(context: C.Renamings, other: Pattern): C.Renamings;

    public abstract is_same(other: Pattern): void;
    public abstract toString(): string;
}

export function covers(patterns: I.List<Pattern>, type: V.Value): void {
    // Check whether all patterns destruct the type
    patterns.forEach(pattern => {
        if (pattern instanceof Var || pattern instanceof Hole)
            return;

        if (type instanceof V.Atom) {
            if (!(pattern instanceof Atom))
                throw new Error("Cannot destruct atom with non-atom pattern");
        } else if (type instanceof V.Datatype) {
            if (!(pattern instanceof Datatype))
                throw new Error("Cannot destruct constructor with non-constructor pattern");
            if (!type.constructors.has(pattern.constr))
                throw new Error("Cannot destructure datatype with constructor from another datatype");
        } else if (type instanceof V.Sigma) {
            if (!(pattern instanceof Sigma))
                throw new Error("Cannot destruct cons with non-cons pattern");
        } else {
            throw new Error("Cannot destructure this type of value in a match");
        }
    });
}

export class Hole extends Pattern {
    public override admits(_against: V.Value): boolean {
        return true;
    }

    public override extend_context(context: E.Context): E.Context {
        return context;
    }

    public override extend_rho(context: V.Rho, _value: V.Value): V.Rho {
        return context;
    }

    public override extend_renamings(context: C.Renamings, _other: Hole): C.Renamings {
        return context;
    }

    public override is_same(other: Pattern): void {
        if (!(other instanceof Hole))
            throw new Error("Hole is not the same");
    }

    public override toString(): string {
        return "_";
    }
}

export class Var extends Pattern {
    public constructor(
        public name: Symbol
    ) { super(); }

    public override admits(_against: V.Value): boolean {
        return true;
    }

    public override extend_context(context: E.Context, type: V.Value): E.Context {
        return context.push({ type: "HasType", name: this.name, value: type });
    }

    public override extend_rho(context: V.Rho, value: V.Value): V.Rho {
        return context.set(this.name, value);
    }

    public override extend_renamings(context: C.Renamings, other: Var): C.Renamings {
        return context.add(this.name, other.name);
    }

    public override is_same(other: Pattern): void {
        if (!(other instanceof Var && other.name === this.name))
            throw new Error("Not same Var");
    }

    public override toString(): string {
        return this.name;
    }
}

export class Datatype extends Pattern {
    public constructor(
        public constr: Symbol,
        public binders: I.List<Pattern>,
        public name: Symbol | undefined
    ) { super(); }

    public override admits(against: V.Value): boolean {
        return against instanceof V.Constructor
            && against.name === this.constr
            && this.binders.zip(against.args).every(([binder, arg]) => binder.admits(arg));
    }

    public override extend_context(context: E.Context, type: V.Value): E.Context {
        if (type instanceof V.Datatype) {
            const constr = type.constructors.get(this.constr)!;
            const new_context = this.name
                ? context.push({ type: "HasType", name: this.name, value: type })
                : context;
            // There's an error with the typing definition of zip with lists and ordered maps, so a manual cast is needed
            const new_binders = this.binders.zip(constr.fields) as unknown as I.List<[Pattern, [Symbol, V.Value]]>;
            return new_binders.reduce((context, [pattern, [_, arg]]) => pattern.extend_context(context, arg), new_context);
        } else {
            throw new Error("Cannot destruct non-constructor variable with datatype pattern");
        }
    }

    public override extend_rho(context: V.Rho, value: V.Value): V.Rho {
        if (value instanceof V.Constructor) {
            const new_context = this.name ? context.set(this.name, value) : context;
            return this.binders
                .zip(value.args)
                .reduce((context, [pattern, arg]) => pattern.extend_rho(context, arg), new_context);
        } else {
            throw new Error("Cannot destruct non-constructor variable with datatype pattern");
        }
    }

    public override extend_renamings(context: C.Renamings, other: Datatype): C.Renamings {
        const new_context = this.name && other.name ? context.add(this.name, other.name) : context;
        return this.binders
            .zip(other.binders)
            .reduce((context, [left, right]) => left.extend_renamings(context, right), new_context);
    }

    public override is_same(other: Pattern): void {
        if (!(other instanceof Datatype
            && this.constr === other.constr
            && this.name === other.name
            && this.binders.zipWith((left, right) => left.is_same(right), other.binders)))
            throw new Error("Not same Datatype");
    }

    public override toString(): string {
        const binders = this.binders.map(b => b.toString()).join(" ");
        return `(${this.constr} ${binders} ${this.name ? "'as " + this.name : ""})`;
    }
}

export class Atom extends Pattern {
    public constructor(
        public name: Symbol
    ) { super(); }

    public override admits(against: V.Value): boolean {
        return against instanceof V.Tick && against.name === this.name;
    }

    public override extend_context(context: E.Context, _type: V.Value): E.Context {
        return context
    }

    public override extend_rho(context: V.Rho, _value: V.Value): V.Rho {
        return context;
    }

    public override extend_renamings(context: C.Renamings, _other: Pattern): C.Renamings {
        return context;
    }

    public override is_same(other: Pattern): void {
        if (!(other instanceof Atom && this.name === other.name))
            throw new Error("Not same Atom");
    }

    public override toString(): string {
        return `'${this.name}`;
    }
}

export class Sigma extends Pattern {
    public constructor(
        public left: Pattern,
        public right: Pattern
    ) { super(); }

    public override admits(against: V.Value): boolean {
        return against instanceof V.Cons
            && this.left.admits(against.fst)
            && this.right.admits(against.snd);
    }

    public override extend_context(context: E.Context, type: V.Value): E.Context {
        if (type instanceof V.Sigma) {
            const context_left = this.left.extend_context(context, type.value);
            return this.right.extend_context(context_left, type.body.instantiate(type.name, new V.Neutral(type.value, new N.Var(type.name))));
        } else {
            throw new Error("Cannot destructure a Sigma pattern with non-cons value");
        }
    }

    public override extend_rho(context: V.Rho, value: V.Value): V.Rho {
        if (value instanceof V.Cons) {
            const new_context = this.left.extend_rho(context, value.fst);
            return this.right.extend_rho(new_context, value.snd);
        } else {
            throw new Error("Cannot destructure a Sigma pattern with non-cons value");
        }
    }

    public override extend_renamings(context: C.Renamings, other: Sigma): C.Renamings {
        const new_context = this.left.extend_renamings(context, other.left);
        return this.right.extend_renamings(new_context, other.right);
    }

    public override is_same(other: Pattern): void {
        if (!(other instanceof Sigma))
            throw new Error("Not same Sigma");
        this.left.is_same(other.left);
        this.right.is_same(other.right);
    }

    public override toString(): string {
        return `(cons ${this.left.toString()} ${this.right.toString()})`;
    }
}