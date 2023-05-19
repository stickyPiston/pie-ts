import * as V from "./value.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";

type Symbol = string;
type Renaming = I.Map<Symbol, Symbol>;

export abstract class Core {
  public abstract eval(gamma: Context<V.Value>): V.Value;
  public abstract alpha_equiv(
      other: Core, context?: { left: Renaming, right: Renaming }): void;
}

export class Var implements Core {
  public constructor(public name: Symbol) { }
  public eval(_gamma: Context<V.Value>) { return new V.Nat(); } // TODO
}

export class Nat implements Core {
  public eval(_gamma: Context<V.Value>) { return new V.Nat(); }
}

export class Atom implements Core {
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Atom(); }
}

export class Tick implements Core {
  public constructor(public name: Symbol) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Atom(); } // TODO
}

export class Sigma implements Core {
  public constructor(public name: Symbol, public value: Core, public body: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Atom(); } // TODO
}

export class Cons implements Core {
  public constructor(public left: Core, public right: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Atom(); } // TODO
}

export class Car implements Core {
  public constructor(public pair: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Atom(); } // TODO
}

export class Cdr implements Core {
  public constructor(public pair: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Atom(); } // TODO
}

export class Pi implements Core {
  public constructor(public name: Symbol, public value: Core, public body: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Atom(); } // TODO
}

export class Lambda implements Core {
  public constructor(public name: Symbol, public body: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Atom(); } // TODO
}

export class Appl implements Core {
  public constructor(public func: Core, public arg: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Atom(); } // TODO
}

export class Zero implements Core {
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Zero(); } // TODO
}

export class Add1 implements Core {
  public constructor(public num: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Zero(); } // TODO
}

export class WhichNat implements Core {
  public constructor(public target: Core, public base_type: V.Value,
                     public base_expr: Core, public add1: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Zero(); } // TODO
}

export class IterNat implements Core {
  public constructor(public target: Core, public base_type: V.Value,
                     public base_expr: Core, public add1: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Zero(); } // TODO
}

export class RecNat implements Core {
  public constructor(public target: Core, public base_type: V.Value,
                     public base: Core, public add1: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Zero(); } // TODO
}

export class IndNat implements Core {
  public constructor(public target: Core, public motive: Core,
                     public base_expr: Core, public add1: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Zero(); } // TODO
}

export class List implements Core {
  public constructor(public e: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Zero(); } // TODO
}

export class Nil implements Core {
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Nil(); }
}

export class ListCons implements Core {
  public constructor(public head: Core, public tail: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Nil(); } // TODO
}

export class RecList implements Core {
  public constructor(public target: Core, public nil_type: V.Value, public core_nil: Core, public cons: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Nil(); } // TODO
}

export class IndList implements Core {
  public constructor(public target: Core, public motive: Core,
                     public base: Core, public step: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Nil(); } // TODO
}

export class Vec implements Core {
  public constructor(public e: Core, public ell: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Nil(); } // TODO
}

export class VecNil implements Core {
  public eval(_gamma: Context<V.Value>): V.Value { return new V.VecNil(); }
}

export class VecCons implements Core {
  public constructor(public head: Core, public tail: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.VecNil(); } // TODO
}

export class Head implements Core {
  public constructor(public vec: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.VecNil(); } // TODO
}

export class Tail implements Core {
  public constructor(public vec: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.VecNil(); } // TODO
}

export class U implements Core {
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); }
}

export class IndVec implements Core {
  public constructor(public ell: Core, public target: Core, public motive: Core,
                     public base: Core, public step: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class Equal implements Core {
  public constructor(public X: V.Value, public from: Core, public to: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class Same implements Core {
  public constructor(public mid: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class Symm implements Core {
  public constructor(public t: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class Cong implements Core {
  public constructor(public X: V.Value, public target: Core, public func: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class Replace implements Core {
  public constructor(public target: Core, public motive: Core, public base: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class Trans implements Core {
  public constructor(public left: Core, public right: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class IndEqual implements Core {
  public constructor(public target: Core, public motive: Core, public base: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class Either implements Core {
  public constructor(public left: Core, public right: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class Left implements Core {
  public constructor(public value: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class Right implements Core {
  public constructor(public value: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class IndEither implements Core {
  public constructor(public target: Core, public motive: Core,
                     public left: Core, public right: Core) { }

  public eval(_gamma: Context<V.Value>): V.Value { return new V.U(); } // TODO
}

export class Trivial implements Core {
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Trivial() }
}

export class Sole implements Core {
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Sole() }
}

export class Absurd implements Core {
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Absurd() }
}

export class IndAbsurd implements Core {
  public constructor(public target: Core, public motive: Core) { }
  public eval(_gamma: Context<V.Value>): V.Value { return new V.Absurd() } // TODO
}
