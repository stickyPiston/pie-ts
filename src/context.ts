import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";
import * as V from "./value.ts";
import { N } from "./index.ts";

export type Symbol = string;

// #region Entries

export abstract class Entry {
    public constructor(public name: Symbol) { }
    public abstract toString(): string;
}

export class ConstructorDef {
    public constructor(
        public name: Symbol,
        public parameters: Telescope
    ) { }

    public toString(): string {
        return `ConstructorDef ${JSON.stringify(this)}`;
    }
}

export class Telescope {
    public constructor(public entries: I.List<Entry>) { }

    public toString(): string {
        return `Telescope ${this.entries.toJSON()}`;
    }
}

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

export class HasType extends Entry {
    public constructor(
        name: Symbol,
        public type: V.Value
    ) { super(name); }

    public override toString(): string {
        return `HasType ${JSON.stringify(this, null, "\t")}`;
    }
}

export class Define extends Entry {
    public constructor(
        name: Symbol,
        public value: V.Value
    ) { super(name); }

    public override toString(): string {
        return `Define ${JSON.stringify(this, null, "\t")}`;
    }
}

export class Claim extends Entry {
    public constructor(
        name: Symbol,
        public type: V.Value
    ) { super(name); }

    public override toString(): string {
        return `Claim ${JSON.stringify(this, null, "\t")}`;
    }
}

export class Bind extends Entry {
    public constructor(name: Symbol) { super(name); }

    public override toString(): string {
        return `Bind ${JSON.stringify(this, null, "\t")}`;
    }
}

// #endregion

// #region Contexts

export abstract class Context<T extends Entry> {
    public constructor(protected entries: I.List<T> = I.List()) { }

    public get(name: Symbol): T | undefined {
        return this.entries.findLast(entry => entry.name === name);
    }

    public get_all(name: Symbol): I.List<T> {
        return this.entries.filter(entry => entry.name === name);
    }

    public has(name: Symbol): boolean {
        return !!this.get(name);
    }

    public fresh(name: Symbol): Symbol {
        return this.has(name)
            ? this.fresh(name + "'")
            : name;
    }
}

export class Sigma extends Context<Define | Claim | Data> {
    public set(entry: Define | Claim | Data): Sigma {
        return new Sigma(this.entries.push(entry));
    }

    public to_gamma(): Gamma {
        return new Gamma(this.entries);
    }
}

export class Gamma extends Context<Define | Claim | HasType | Data> {
    public set(name: Symbol, type: V.Value): Gamma {
        return new Gamma(this.entries.push(new HasType(name, type)));
    }

    public to_rho(): Rho {
        const filtered_entries = this.entries
            .map(entry => entry instanceof Claim
                ? new Define(entry.name, new V.Neutral(entry.type, new N.Var(entry.name)))
                : entry)
            .filter(entry => entry instanceof Define || entry instanceof Data) as I.List<Define | Data>;
        return new Rho(filtered_entries);
    }
}

export class Rho extends Context<Define | Data> {
    public to_bound(): Bound {
        return new Bound(this.entries.map(({ name }) => new Bind(name)));
    }

    public set(name: Symbol, value: V.Value): Rho {
        return new Rho(this.entries.push(new Define(name, value)));
    }
}

export class Bound extends Context<Bind> {
    public set(name: Symbol) {
        return new Bound(this.entries.push(new Bind(name)));
    }
}

/**
 * A renaming map maps variable names to unique indices
 */
export type Renaming = I.Map<Symbol, number>;

/**
 * Renamings class contains renaming maps for 2 core expressions at the same time.
 * Two variables are the same when the indices in both maps are the same
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