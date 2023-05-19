import * as C from "./core.ts";
import * as N from "./neutral.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";

type Symbol = string;

export class Closure<T> {
  public constructor(public context: I.Map<Symbol, T>, public body: C.Core) { }
  public instantiate(name: Symbol, value: T) {
    return this.body.normalise(this.context.set(name, value));
  }
}

export abstract class Value {
  public abstract description: string;

  public read_back(context: Rho, type: Value): C.Core {
    throw new Error(`Could not read back normal form ${this.description} : ${type.description}`);
  }

  public read_back_type(): C.Core {
    throw new Error(`Could not read back type ${this.description}`);
  }

  public same_type(other: Value): void {
    const core_self = this.read_back_type();
    const core_other = other.read_back_type();
    core_self.alpha_equiv(core_other);
  }

  public same_value(type: Value, other: Value): void {
    const core_self = this.read_back(type);
    const core_other = other.read_back(type);
    core_self.alpha_equiv(core_other);
  }
}

// Types

abstract class Type extends Value {
  public override read_back(_type: Value): C.Core {
    return this.read_back_type();
  }
}

export class Nat extends Type {
  public description = "Nat type";
  public override read_back_type(): C.Core {
    return new C.Nat();
  }
}

export class U extends Type {
  public description = "U type";
  public override read_back_type(): C.Core {
    return new C.U();
  }
}

export class Atom extends Type {
  public description = "Atom type";
  public override read_back_type(): C.Core {
    return new C.Atom();
  }
}

export class Trivial extends Type {
  public description = "Trivial type";
  public override read_back_type(): C.Core {
    return new C.Trivial();
  }
}
export class Absurd extends Type {
  public description = "Absurd type";
  public override read_back_type(): C.Core {
    return new C.Absurd();
  }
}

export class Sigma extends Value {
  public description = "Sigma type";
  public constructor(public name: Symbol, public value: Value, public body: Closure<Value>) { super(); }

  public override read_back_type(): C.Core {
    
  }
}

export class Pi extends Value {
  public constructor(public name: Symbol, public value: Value, public body: Closure<Value>) { super(); }
}

export class Add1 extends Value {
  public constructor(public n: Value) { }
}
export class Sole extends Value { }
export class Zero extends Value { }
export class Nil extends Value { }

export class List extends Value {
  public constructor(public e: Value) { super(); }
}

export class Vec extends Value {
  public constructor(public e: Value, public ell: Value) { super(); }
}

export class VecNil extends Value { }

export class Equal extends Value {
  public constructor(public X: Value, public from: Value, public to: Value) { super(); }
}

export class Lambda extends Value {
  public constructor(public name: Symbol, public body: Closure<Value>) { super(); }
}

export function apply_many(func: Value, ...args: Value[]): Value {
  return args.reduce((acc, arg) => {
    if (acc instanceof Lambda) {
      return acc.body.instantiate(acc.name, arg);
    } else {
      throw new Error(`Expected a function, got ${acc.description}`);
    }
  }, func);
}

export class Same extends Value {
  public constructor(public thing: Value) { super(); }
}

export class Either extends Value {
  public constructor(public left: Value, public right: Value) { super(); }
}

export class Neutral extends Value {
    public constructor(public type: Value, public neutral: N.Neutral) { super(); }
}
