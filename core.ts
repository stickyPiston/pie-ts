import * as V from "./value.ts";
import { Context, Symbol } from "./utils.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";

export class Closure {
  public constructor(public env: I.Map<Symbol, V.Value>, public body: Core) { }
  public instantiate(name: Symbol, value: V.Value): V.Value {
    const new_context = this.env.set(name, value);
    return this.body.normalise(new_context);
  }
}

export interface Core {
  normalise: (gamma: Context<V.Value>) => V.Value
}

export class Var implements Core {
  public constructor(public name: Symbol) { }
  public normalise(_gamma: Context<V.Value>) { return new V.Nat(); } // TODO
}

export class Nat implements Core {
  public normalise(_gamma: Context<V.Value>) { return new V.Nat(); }
}

export class Atom implements Core {
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.Atom(); }
}

export class Tick implements Core {
  public constructor(public name: Symbol) { }
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.Atom(); } // TODO
}

export class Sigma implements Core {
  public constructor(public name: Symbol, public value: Core, public body: Core) { }
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.Atom(); } // TODO
}

export class Cons implements Core {
  public constructor(public left: Core, public right: Core) { }
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.Atom(); } // TODO
}

export class Car implements Core {
  public constructor(public pair: Core) { }
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.Atom(); } // TODO
}

export class Cdr implements Core {
  public constructor(public pair: Core) { }
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.Atom(); } // TODO
}

export class Pi implements Core {
  public constructor(public name: Symbol, public value: Core, public body: Core) { }
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.Atom(); } // TODO
}

export class Lambda implements Core {
  public constructor(public name: Symbol, public body: Core) { }
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.Atom(); } // TODO
}

export class Appl implements Core {
  public constructor(public func: Core, public arg: Core) { }
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.Atom(); } // TODO
}

export class Zero implements Core {
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.Zero(); } // TODO
}

export class Add1 implements Core {
  public constructor(public num: Core) { }
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.Zero(); } // TODO
}

export class WhichNat implements Core {
  public constructor(public target: Core, public base_type: V.Value,
                     public base_expr: Core, public add1: Core) { }
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.Zero(); } // TODO
}

export class IterNat implements Core {
  public constructor(public target: Core, public base_type: V.Value,
                     public base_expr: Core, public add1: Core) { }
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.Zero(); } // TODO
}

export class RecNat implements Core {
  public constructor(public target: Core, public motive: Core,
                     public base: Core, public add1: Core) { }
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.Zero(); } // TODO
}

export class IndNat implements Core {
  public constructor(public target: Core, public motive: Core,
                     public base_expr: Core, public add1: Core) { }
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.Zero(); } // TODO
}

export class List implements Core {
  public constructor(public e: Core) { }
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.Zero(); } // TODO
}

export class Nil implements Core {
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.Nil(); }
}

export class ListCons implements Core {
  public constructor(public head: Core, public tail: Core) { }
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.Nil(); } // TODO
}

export class RecList implements Core {
  public constructor(public target: Core, public nil_type: V.Value, public core_nil: Core, public cons: Core) { }
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.Nil(); } // TODO
}

export class IndList implements Core {
  public constructor(public target: Core, public motive: Core,
                     public base: Core, public step: Core) { }
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.Nil(); } // TODO
}

export class Vec implements Core {
  public constructor(public e: Core, public ell: Core) { }
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.Nil(); } // TODO
}

export class VecNil implements Core {
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.VecNil(); }
}

export class VecCons implements Core {
  public constructor(public head: Core, public tail: Core) { }
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.VecNil(); } // TODO
}

export class Head implements Core {
  public constructor(public vec: Core) { }
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.VecNil(); } // TODO
}

export class Tail implements Core {
  public constructor(public vec: Core) { }
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.VecNil(); } // TODO
}

export class U implements Core {
  public normalise(_gamma: Context<V.Value>): V.Value { return new V.U(); }
}
