import * as C from "./core.ts";
import * as V from "./value.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";
import * as O from "./context.ts";

/**
 * Normal values are values paired with their type such that
 * they can read back without missing information
 */
export class Normal {
    public constructor(
        public value: V.Value,
        public type: V.Value
    ) { }
    
    /**
     * Read back a normal value to a core expression
     * @param context the runtime context
     * @returns the core expression that generates this value
     */
    public read_back(context: O.Rho): C.Core {
        return this.value.read_back(context, context.to_bound(), this.type);
    }
}

/**
 * A neutral value is a well-typed value that cannot be evaluated further because of unknown information
 */
export abstract class Neutral {
    /**
     * Read back a neutral value to a core expression
     * @param context the runtime context
     */
    public abstract read_back(context: O.Rho): C.Core;
}

export class Var extends Neutral {
    public constructor(public name: string) { super(); }

    public override read_back(_context: O.Rho): C.Core {
        return new C.Var(this.name);
    }
}

export class Appl extends Neutral {
    public constructor(
        public rator: Neutral, public rand: Normal
    ) { super(); }

    public override read_back(context: O.Rho): C.Core {
        const core_rator = this.rator.read_back(context),
            core_rand = this.rand.read_back(context);
        return new C.Appl(core_rator, core_rand);
    }
}

export class Car extends Neutral {
    public constructor(public pair: Neutral) { super(); }

    public override read_back(context: O.Rho): C.Core {
        const core_pair = this.pair.read_back(context);
        return new C.Car(core_pair);
    }
}

export class Cdr extends Neutral {
    public constructor(public pair: Neutral) { super(); }

    public override read_back(context: O.Rho): C.Core {
        const core_pair = this.pair.read_back(context);
        return new C.Cdr(core_pair);
    }
}

export class Match extends Neutral {
    public constructor(
        public target: Neutral,
        // arms don't need to be converted to neutrals
        public arms: I.List<C.Arm>,
        public motive: Normal
    ) { super(); }

    public override read_back(context: O.Rho): C.Core {
        const core_target = this.target.read_back(context);
        return new C.Match(core_target, this.arms, this.motive.value);
    }
}