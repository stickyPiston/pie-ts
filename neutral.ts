import * as C from "./core.ts";
import * as V from "./value.ts";

export class Normal {
    public constructor(public value: V.Value, public type: V.Value) { }
    public read_back(context: V.Rho): C.Core {
        return this.value.read_back(context, this.type);
    }
}

export abstract class Neutral {
    public abstract read_back(context: V.Rho): C.Core;
}

export class Var extends Neutral {
    public constructor(public name: string) { super(); }

    public override read_back(_context: V.Rho): C.Core {
        return new C.Var(this.name);
    }
}

export class Appl extends Neutral {
    public constructor(public rator: Neutral, public rand: Normal) { super(); }

    public override read_back(context: V.Rho): C.Core {
        const core_rator = this.rator.read_back(context),
              core_rand  = this.rand.read_back(context);
        return new C.Appl(core_rator, core_rand);
    }
}

// Nat eliminators

export class WhichNat extends Neutral {
    public constructor(public target: Neutral, public zero: Normal, public add1: Normal) { super(); }

    public override read_back(context: V.Rho): C.Core {
        const core_zero = this.zero.read_back(context),
              core_add1 = this.add1.read_back(context),
              core_trgt = this.target.read_back(context);
        return new C.WhichNat(core_trgt, this.zero.type, core_zero, core_add1);
    }
}

export class IterNat extends Neutral {
    public constructor(public target: Neutral, public zero: Normal,
                       public add1: Normal) { super(); }

    public override read_back(context: V.Rho): C.Core {
        const core_target = this.target.read_back(context),
              core_zero   = this.zero.read_back(context),
              core_add1   = this.add1.read_back(context);
        return new C.IterNat(core_target, this.zero.type, core_zero, core_add1);
    }
}

export class RecNat extends Neutral {
    public constructor(public target: Neutral, public zero: Normal, public add1: Normal) { super(); }

    public override read_back(context: V.Rho): C.Core {
        const core_zero = this.zero.read_back(context),
              core_add1 = this.add1.read_back(context),
              core_trgt = this.target.read_back(context);
        return new C.RecNat(core_trgt, this.zero.type, core_zero, core_add1);
    }
}

export class IndNat extends Neutral {
    public constructor(public target: Neutral, public motive: Normal,
                       public zero: Normal, public add1: Normal) { super(); }

    public override read_back(context: V.Rho): C.Core {
        const core_mot  = this.motive.read_back(context),
              core_zero = this.zero.read_back(context),
              core_add1 = this.add1.read_back(context),
              core_trgt = this.target.read_back(context);
        return new C.IndNat(core_trgt, core_mot, core_zero, core_add1);
    }
}

// Pair eliminators

export class Car extends Neutral {
    public constructor(public pair: Neutral) { super(); }

    public override read_back(context: V.Rho): C.Core {
        const core_pair = this.pair.read_back(context);
        return new C.Car(core_pair);
    }
}

export class Cdr extends Neutral {
    public constructor(public pair: Neutral) { super(); }

    public override read_back(context: V.Rho): C.Core {
        const core_pair = this.pair.read_back(context);
        return new C.Cdr(core_pair);
    }
}

// List eliminators

export class RecList extends Neutral {
    public constructor(public target: Neutral, public base: Normal, public step: Normal) { super(); }

    public override read_back(context: V.Rho): C.Core {
        const core_target = this.target.read_back(context),
              core_base   = this.base.read_back(context),
              core_step   = this.step.read_back(context);
        return new C.RecList(core_target, this.base.type, core_base, core_step);
    }
}

export class IndList extends Neutral {
    public constructor(public target: Neutral, public motive: Normal,
                       public base: Normal, public step: Normal) { super(); }

    public override read_back(context: V.Rho): C.Core {
        const core_target = this.target.read_back(context),
              core_motive = this.motive.read_back(context),
              core_base   = this.base.read_back(context),
              core_step   = this.step.read_back(context);
        return new C.IndList(core_target, core_motive, core_base, core_step);
    }
}

// Equality eliminators

export class Replace extends Neutral {
    public constructor(public target: Neutral, public motive: Normal, public base: Normal) { super(); }

    public override read_back(context: V.Rho): C.Core {
        const core_target = this.target.read_back(context),
              core_motive = this.motive.read_back(context),
              core_base   = this.base.read_back(context);
        return new C.Replace(core_target, core_motive, core_base);
    }
}

export class TransLeft extends Neutral {
    public constructor(public left: Neutral, public right: Normal) { super(); }

    public override read_back(context: V.Rho): C.Core {
        const core_left  = this.left.read_back(context),
              core_right = this.right.read_back(context);
        return new C.Trans(core_left, core_right);
    }
}

export class TransRight extends Neutral {
    public constructor(public left: Normal, public right: Neutral) { super(); }

    public override read_back(context: V.Rho): C.Core {
        const core_left  = this.left.read_back(context),
              core_right = this.right.read_back(context);
        return new C.Trans(core_left, core_right);
    }
}

export class Cong extends Neutral {
    public constructor(public target: Neutral, public func: Normal) { super(); }
    public override read_back(context: V.Rho): C.Core {
        const core_target = this.target.read_back(context),
              core_func   = this.func.read_back(context);
        return new C.Cong(null, core_target, core_func);
    }
} 

export class Symm extends Neutral {
    public constructor(public equality: Neutral) { super(); }
    public override read_back(context: V.Rho): C.Core {
        return new C.Symm(this.equality.read_back(context));
    }
}

export class IndEqual extends Neutral {
    public constructor(public target: Neutral, public motive: Normal, public base: Normal) { super(); }
    public override read_back(context: V.Rho): C.Core {
        const core_target = this.target.read_back(context),
              core_motive = this.motive.read_back(context),
              core_base   = this.base.read_back(context);
        return new C.IndEqual(core_target, core_motive, core_base);
    }
}

export class Head extends Neutral {
    public constructor(public target: Neutral) { super(); }
    public override read_back(context: V.Rho): C.Core {
        return new C.Head(this.target.read_back(context));
    }
}

export class Tail extends Neutral {
    public constructor(public target: Neutral) { super(); }
    public override read_back(context: V.Rho): C.Core {
        return new C.Tail(this.target.read_back(context));
    }
}

interface HasReadBack { read_back(context: V.Rho): C.Core; };
function read_back_indVec(this: { ell: HasReadBack, target: HasReadBack,
                                  motive: HasReadBack, base: HasReadBack,
                                  step: HasReadBack },
                          context: V.Rho): C.Core {
    const core_ell = this.ell.read_back(context),
          core_target = this.target.read_back(context),
          core_motive = this.target.read_back(context),
          core_base   = this.base.read_back(context),
          core_step   = this.step.read_back(context);
    return new C.IndVec(core_ell, core_target, core_motive, core_base, core_step);
}

export class IndVecEll extends Neutral {
    public constructor(public ell: Neutral, public target: Normal, public motive: Normal,
                       public base: Normal, public step: Normal) { super(); }
    public override read_back = read_back_indVec.bind(this);
}

export class IndVecVec extends Neutral {
    public constructor(public ell: Normal, public target: Neutral, public motive: Normal,
                       public base: Normal, public step: Normal) { super(); }
    public override read_back = read_back_indVec.bind(this);
}

export class IndVecEllVec extends Neutral {
    public constructor(public ell: Neutral, public target: Neutral, public motive: Normal,
                       public base: Normal, public step: Normal) { super(); }
    public override read_back = read_back_indVec.bind(this);
}

export class IndEither extends Neutral {
    public constructor(public target: Neutral, public motive: Normal, public left: Normal,
                       public right: Normal) { super(); }
    public override read_back(context: V.Rho): C.Core {
        const core_target = this.target.read_back(context),
              core_motive = this.motive.read_back(context),
              core_left   = this.left.read_back(context),
              core_right  = this.right.read_back(context);
        return new C.IndEither(core_target, core_motive, core_left, core_right);
    }
}

export class IndAbsurd extends Neutral {
    public constructor(public target: Neutral, public motive: Normal) { super(); }
    public override read_back(context: V.Rho): C.Core {
        const core_target = this.target.read_back(context),
              core_motive = this.motive.read_back(context);
        return new C.IndAbsurd(core_target, core_motive);
    }
}
