import * as C from "./core.ts";
import * as V from "./value.ts";

/**
 * Normal values are values paired with their type such that
 * they can read back without missing information
 */
export class Normal {
    public constructor(public value: V.Value, public type: V.Value) {}
    
    /**
     * Read back a normal value to a core expression
     * @param context the runtime context
     * @returns the core expression that generates this value
     */
    public read_back(context: V.Rho): C.Core {
        return this.value.read_back(context, C.to_bound(context), this.type);
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
    public abstract read_back(context: V.Rho): C.Core;
}

export class Var extends Neutral {
    public constructor(public name: string) {
        super();
    }

    public override read_back(_context: V.Rho): C.Core {
        return new C.Var(this.name);
    }
}

export class Appl extends Neutral {
    public constructor(public rator: Neutral, public rand: Normal) {
        super();
    }

    public override read_back(context: V.Rho): C.Core {
        const core_rator = this.rator.read_back(context),
            core_rand = this.rand.read_back(context);
        return new C.Appl(core_rator, core_rand);
    }
}

// Pair eliminators

export class Car extends Neutral {
    public constructor(public pair: Neutral) {
        super();
    }

    public override read_back(context: V.Rho): C.Core {
        const core_pair = this.pair.read_back(context);
        return new C.Car(core_pair);
    }
}

export class Cdr extends Neutral {
    public constructor(public pair: Neutral) {
        super();
    }

    public override read_back(context: V.Rho): C.Core {
        const core_pair = this.pair.read_back(context);
        return new C.Cdr(core_pair);
    }
}

// TODO: Add neutral values for ind-+