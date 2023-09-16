import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";
import * as V from "./value.ts";
import * as N from "./neutral.ts";
import * as E from "./expr.ts";

export type Symbol = string;

// #region Entries

/**
 * An entry in a context, it should at least have a name
 */
export abstract class Entry {
    public constructor(public name: Symbol) { }
    public abstract toString(): string;
}

// TODO
export class ConstructorDef {
    public constructor(
        public name: Symbol,
        public parameters: Telescope
    ) { }

    public toString(): string {
        return `ConstructorDef ${JSON.stringify(this)}`;
    }
}

export type TelescopePart = { name: Symbol, expr: E.Expr };
export class Telescope {
    public constructor(public entries: I.List<TelescopePart>) { }

    public toString(): string {
        return `Telescope ${this.entries.toJSON()}`;
    }
}

// TODO
export class Data extends Entry {
    public constructor(
        name: Symbol,
        public parameters: Telescope,
        public constructors: I.List<ConstructorDef>
    ) { super(name); }

    public override toString(): string {
        return `Data ${JSON.stringify(this, null, "\t")}`;
    }
}

/**
 * A binding from variables to the type they have in expression context
 */
export class HasType extends Entry {
    public constructor(
        name: Symbol,
        public type: V.Value
    ) { super(name); }

    public override toString(): string {
        return `HasType ${JSON.stringify(this, null, "\t")}`;
    }
}

/**
 * A binding from variables to the normal form they have in any context
 */
export class Define extends Entry {
    public constructor(
        name: Symbol,
        public value: V.Value
    ) { super(name); }

    public override toString(): string {
        return `Define ${JSON.stringify(this, null, "\t")}`;
    }
}

/**
 * A binding from variables to the types they have in global state
 */
export class Claim extends Entry {
    public constructor(
        name: Symbol,
        public type: V.Value
    ) { super(name); }

    public override toString(): string {
        return `Claim ${JSON.stringify(this, null, "\t")}`;
    }
}

/**
 * The binding for Bound
 */
export class Bind extends Entry {
    public constructor(name: Symbol) { super(name); }

    public override toString(): string {
        return `Bind ${JSON.stringify(this, null, "\t")}`;
    }
}

// #endregion

// #region Contexts

/**
 * A context is a mapping from names to entries.
 */
export abstract class Context<T extends Entry> {
    public constructor(protected entries: I.List<T> = I.List()) { }

    /**
     * Get the latest entry associated with a variable from this context
     * @param name the name of the variable
     * @returns the last entry associated with the given name regardless the type
     */
    public get(name: Symbol): T | undefined {
        return this.entries.findLast(entry => entry.name === name);
    }

    /**
     * Get all the entries associated with the given name in the context
     * @param name the name of the variable
     * @returns all entries associated with a variable in order they were added
     */
    public get_all(name: Symbol): I.List<T> {
        return this.entries.filter(entry => entry.name === name);
    }

    /**
     * Check whether a variable has an entry in the context
     * @param name the name of the variable
     * @returns whether the variable has an entry in the context
     */
    public has(name: Symbol): boolean {
        return !!this.get(name);
    }

    /**
     * Generate a fresh name based off a starting name
     * @param name the starting name of the new variable
     * @returns a fresh name such that return ∉ this
     */
    public fresh(name: Symbol): Symbol {
        return this.has(name)
            ? this.fresh(name + "'")
            : name;
    }
}

/**
 * Sigma (σ) is the the top-level context also called program state, it contains
 * defines, claims and datas which are defined through top-level statements.
 */
export class Sigma extends Context<Define | Claim | Data> {
    /**
     * Push a new entry to this σ
     * @param entry an new entry
     * @returns a new σ with the entry at the end
     */
    public set(entry: Define | Claim | Data): Sigma {
        return new Sigma(this.entries.push(entry));
    }

    /**
     * Generate the Γ from this σ
     * @returns the Γ based off this σ
     */
    public to_gamma(): Gamma {
        return new Gamma(this.entries);
    }
}

/**
 * Gamma (Γ) is the local expression type-checking context, which inherits all entries from σ
 * and extends it along the way with type annotations for symbols.
 */
export class Gamma extends Context<Define | Claim | HasType | Data> {
    /**
     * Push a new variable-type annotation to this context
     * @param name the name of the variable
     * @param type the type of the variable
     * @returns a new Γ with an entry pushed to the end
     */
    public set(name: Symbol, type: V.Value): Gamma {
        return new Gamma(this.entries.push(new HasType(name, type)));
    }

    /**
     * Generate a ρ from this Γ
     * @returns a new ρ
     */
    public to_rho(): Rho {
        const filtered_entries = this.entries
            .map(entry => entry instanceof Claim
                ? new Define(entry.name, new V.Neutral(entry.type, new N.Var(entry.name)))
                : entry)
            .filter(entry => entry instanceof Define || entry instanceof Data) as I.List<Define | Data>;
        return new Rho(filtered_entries);
    }
}

/**
 * Rho (ρ) is the runtime context, which contains all normalised definitions and no types.
 * This context is used in evaluating core expressions to normals forms and reading back normal forms to
 * core expressions.
 */
export class Rho extends Context<Define | Data> {
    /**
     * Push a new variable definition binding into this context
     * @param name the name of the variable
     * @param value the value of the variable
     * @returns a new ρ containing the new binding at the end
     */
    public set(name: Symbol, value: V.Value): Rho {
        return new Rho(this.entries.push(new Define(name, value)));
    }

    /**
     * Generate a bound names context from this ρ
     * @returns a new Bound
     */
    public to_bound(): Bound {
        return new Bound(this.entries.map(({ name }) => new Bind(name)));
    }
}

/**
 * Bound is the names context when reading back normals forms to expressions.
 */
export class Bound extends Context<Bind> {
    /**
     * Add a name to the list of bound variables
     * @param name the name of the variable
     * @returns a new Bound with the name set
     */
    public set(name: Symbol) {
        return new Bound(this.entries.push(new Bind(name)));
    }
}

/**
 * A renaming map maps variable names to unique indices.
 */
export type Renaming = I.Map<Symbol, number>;

/**
 * Renamings class contains renaming maps for 2 core expressions at the same time.
 * Two variables are the same when the indices in both maps are the same.
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

// #endregion