import * as C from "./core.ts";
import { Symbol } from "./utils.ts";

export abstract class Value {
  abstract description: string;
  same_type(other: Value): boolean { }
  same_value(type: Value, other: Value): boolean { }
  abstract read_back: () => C.Core;
}

export class Nat extends Value { }

export class U extends Value { }

export class Atom extends Value { }

export class Sigma extends Value {
  public constructor(public name: Symbol, public value: Value, public body: C.Closure<Value>) { super(); }
}

export class Pi extends Value {
  public constructor(public name: Symbol, public value: Value, public body: C.Closure<Value>) { super(); }
}

export class Add1 extends Value {
  public constructor(public n: Value) { }
}
export class Zero extends Value { }
export class Nil extends Value { }

export class List extends Value {
  public constructor(public e: Value) { super(); }
}

export class Vec extends Value {
  public constructor(public e: Value, public ell: Value) { super(); }
}

export class VecNil extends Value { }
