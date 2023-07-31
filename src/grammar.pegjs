{ const { T, A, E, I } = this; }

Program = statements: (Whitespace Statement)+ Whitespace? {
    return I.List(statements).map(statement => statement[1]);
}

Statement = Define / Claim / CheckSame / Data 
          
Define = "(define" Whitespace name: Symbol Whitespace value: Expression ")" {
    return new T.Define(name, value);
}

Claim = "(claim" Whitespace name: Symbol Whitespace type: Expression ")" {
    return new T.Claim(name, type);
}

CheckSame = "(check-same" Whitespace type: Expression Whitespace left: Expression Whitespace right: Expression ")" {
    return new T.CheckSame(type, left, right);
}

Parameters = "(" ")" { return I.List(); }
           / "(" head: Binder tail: (Whitespace Binder)* ")" {
    return I.List([head, ...tail.map(binder => binder[1])]);
}

Data = "(data"
       Whitespace name: Symbol
       Whitespace parameters: Parameters
       Whitespace indices: Parameters
       constructors: (Whitespace Constructor)* ")" {
    const parsed_constructors = constructors.map(constr => constr[1]);
    return new T.Data(name, parameters, indices, I.List(parsed_constructors));
}

Constructor = "(" name: Symbol parameters: (Whitespace Binder)* Whitespace "(" ret_type_name: Symbol ret_type_args: (Whitespace Expression)+ ")" ")" {
    const parsed_parameters = parameters.map(binder => binder[1]);
    const parsed_ret_type = ret_type_args.map(arg => arg[1]);
    return new T.Constructor(name, I.List(parsed_parameters), ret_type_name, I.List(parsed_ret_type));
} / "(" name: Symbol parameters: (Whitespace Binder)* Whitespace ")" {
    const parsed_parameters = parameters.map(binder => binder[1]);
    const last_binder = parsed_parameters[parsed_parameters.length - 1];
    const parsed_ret_type = [last_binder.value];
    return new T.Constructor(name, I.List(parsed_parameters), last_binder.name, I.List(parsed_ret_type));
} / "(" name: Symbol parameters: (Whitespace Binder)* Whitespace ret_type: Var ")" {
    const parsed_parameters = parameters.map(binder => binder[1]);
    return new T.Constructor(name, I.List(parsed_parameters), ret_type, I.List());
}

Expression = Pi / Lambda / Sigma / Atom / Tick / Pair / U / Arrow
           / Lambda / Cons / The / Car / Cdr / Match / Appl / Var

Binder = "(" name: Symbol Whitespace value: Expression ")" {
    return { name, value };
}

Pi = "(" ("Pi" / "Π") Whitespace "(" head: Binder tail: (Whitespace Binder)* ")" Whitespace body: Expression ")" {
    const params = [head, ...tail.map(param => param[1])];
    return new E.Pi(I.List(params), body);
}

Sigma = "(" ("Sigma" / "Σ") "(" head: Binder tail: (Whitespace Binder)* ")" Whitespace body: Expression ")" {
    const params = [head, ...tail.map(param => param[1])];
    return new E.Sigma(I.List(params), body);
}

Atom = "Atom" { return new E.Atom(); }

Pair = "(Pair" Whitespace left: Expression Whitespace right: Expression ")" {
    return new E.Pair(left, right);
}

U = "U" { return new E.U(); }

Arrow = "(" ("->" / "→") Whitespace head: Expression tail: (Whitespace Expression)+ ")" {
    return new E.Arrow(I.List([head, ...tail.map(expr => expr[1])]));
}

Lambda = "(" ("lambda" / "λ") "(" head: Symbol tail: (Whitespace Symbol)* ")" Whitespace body: Expression ")" {
    return new E.Lambda(I.List([head, ...tail.map(param => param[1])]), body);
}

Cons = "(cons" Whitespace left: Expression Whitespace right: Expression ")" {
    return new E.Cons(left, right);
}

Tick = "'" name: Symbol { return new E.Tick(name); }

The = "(the" Whitespace type: Expression Whitespace value: Expression ")" {
    return new E.The(type, value)
}

Var = name: Symbol { return new E.Var(name); }

Cdr = "(cdr" Whitespace pair: Expression ")" {
    return new E.Cdr(pair);
}

Car = "(car" Whitespace pair: Expression ")" {
    return new E.Car(pair);
}

Appl = "(" func: Expression args: (Whitespace Expression)+ ")" {
    return new E.Appl(func, I.List(args.map(arg => arg[1])));
}

Pattern = Hole / VarPat / SigmaPat / DatatypePat / TickPat

Hole = "_" { return new A.Hole(); }

VarPat = name: Symbol { return new A.Var(name); }

SigmaPat = "(cons" Whitespace left: Pattern Whitespace right: Pattern ")" {
    return new A.Sigma(left, right);
}

DatatypePat = "(" constr: Symbol binders: (Whitespace Pattern)+ ")" {
    const parsed_binders = binders.map(binder => binder[1]);
    return new A.Datatype(constr, I.List(parsed_binders), undefined);
}

TickPat = "'" name: Symbol { return new A.Atom(name); }

Arm = "(" pattern: Pattern Whitespace body: Expression ")" {
    return new E.Arm(pattern, body);
}

Match = "(match" Whitespace target: Expression arms: (Whitespace Arm)+ ")" {
    const parsed_arms = arms.map(arm => arm[1]);
    return new E.Match(target, I.List(parsed_arms));
}

Symbol = letters: [a-zA-Z]+ {
    return letters.join("");
}

Whitespace = [ \t\n\r]*