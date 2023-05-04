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
export class Trivial extends Value { }
export class Sole extends Value { }
export class Absurd extends Value { }

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

export class Equal extends Value {
  public constructor(public X: Value, public from: Value, public to: Value) { super(); }
}

export class Lambda extends Value {
  public constructor(public name: Symbol, public body: C.Closure<Value>) { super(); }
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
