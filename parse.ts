import * as T from "./toplevel.ts";
import * as E from "./expr.ts";

export function to_ast(source: string): T.TopLevel[] {
    return astify_toplevels([...parse(lex(source))]);
}

function lex(source: string): string[] {
    return source
        .replace(/[\(\[]/g, " ( ")
        .replace(/[\)\]]/g, " ) ")
        .trim()
        .split(/\s+/);
}

function parse(tokens: string[]): SimpleTree<string>[] {
    const start = new SimpleTree<string>;
    start.add_child(new SimpleTree);
    return tokens.reduce((ast: SimpleTree<string>, token: string) => {
        if (token === "(") {
            ast.add_child(new SimpleTree);
        } else if (token === ")") {
            const last_expr = ast.pop();
            if (ast.last instanceof SimpleTree && last_expr !== undefined)
                ast.last.add_child(last_expr);
            else
                throw new Error("Parsing error");
        } else {
            if (ast.last instanceof SimpleTree)
                ast.last.add_child(token);
            else
                throw new Error("Parsing error");
        }
        return ast;
    }, start).children[0] as unknown as SimpleTree<string>[];
}

class SimpleTree<T> {
    public children: (SimpleTree<T> | T)[] = [];

    public add_child(child: SimpleTree<T> | T) {
        this.children.push(child);
    }

    public pop() { return this.children.pop(); }

    public get last() {
        return this.children[this.children.length - 1]; 
    }

    public *[Symbol.iterator]() {
        for (const child of this.children)
            yield child;
    }
}

function expect_arity<T>(n: number, args: (SimpleTree<T> | T)[]): (SimpleTree<T> | T)[] {
    if (args.length === n) return args;
    else throw new Error(`Expected ${n} argument, but got ${args.length}`);
}

function astify_toplevels(trees: SimpleTree<string>[]): T.TopLevel[] {
    return trees.map(([name, ...args]) => {
        switch (name) {
            case "define": {
                const [name, body] = expect_arity(2, args);
                if (typeof name === "string")
                    return new T.Define(name, astify_expr(body));
                else
                    throw new Error("");
            }
            case "claim": {
                const [name, body] = expect_arity(2, args);
                if (typeof name === "string")
                    return new T.Claim(name, astify_expr(body));
                else
                    throw new Error("");
            }
            case "check-same": {
                const [type, left, right] = expect_arity(3, args).map(astify_expr);
                return new T.CheckSame(type, left, right);
            }
            default: throw new Error(`Invalid toplevel statement ${name}`);
        }
    });
}

function astify_expr(expr: SimpleTree<string> | string): E.Expr {
    if (expr instanceof SimpleTree) {
        const [name, ...args] = expr;
        if (typeof name === "string" && name in constructors) {
            // @ts-ignore: Eventually i will remove the constructors table
            // once inductive data types are implemented, therefore a low-effort
            // solution for now
            return new constructors[name](...args.map(astify_expr));
        } else if (name === "->" || name === "→") {
            return new E.Arrow(args.map(astify_expr));
        } else if (name === "lambda" || name === "λ") {
            const [params, body] = expect_arity(2, args);
            if (params instanceof SimpleTree) {
                const names = [...params].map(name => {
                    if (typeof name === "string") return name;
                    else throw new Error("Expected name");
                });
                return new E.Lambda(names, astify_expr(body));
            } else {
                throw new Error("Expected parameter list");
            }
        } else if (name === "Pi" || name === "Π" || name === "Sigma" || name === "Σ") {
            const [params, body] = expect_arity(2, args);
            if (params instanceof SimpleTree) {
                const bindings = [...params].map(binding => {
                    if (binding instanceof SimpleTree) {
                        const [name, value] = expect_arity(2, binding.children);
                        if (typeof name === "string")
                            return { name, value: astify_expr(value) };
                        else
                            throw new Error("Expected a name");
                    } else {
                        throw new Error("Expected a binding");
                    }
                });

                if (name === "Pi" || name === "Π")
                    return new E.Pi(bindings, astify_expr(body));
                else
                    return new E.Sigma(bindings, astify_expr(body));
            } else {
                throw new Error("Expected list of bindings");
            }
        } else {
            return new E.Appl(astify_expr(name), args.map(astify_expr));
        }
    } else {
        switch (expr) {
            case "nil": return new E.Nil();
            case "vecnil": return new E.VecNil();
            case "Atom": return new E.Atom();
            case "U": return new E.U();
            case "Nat": return new E.Nat();
            case "zero": return new E.Zero();
            case "sole": return new E.Sole();
            case "Trivial": return new E.Trivial();
            case "Absurd": return new E.Absurd();
            default: {
                if (/\d+/.test(expr)) {
                    return new E.NatLit(Number(expr));
                } else {
                    return new E.Var(expr);
                }
            }
        }
    }
}

const constructors = {
    "the": E.The,
    "ind-Absurd": E.IndAbsurd,
    "add1": E.Add1,
    "which-Nat": E.WhichNat,
    "iter-Nat": E.IterNat,
    "rec-Nat": E.RecNat,
    "ind-Nat": E.IndNat,
    "Pair": E.Pair,
    "cons": E.Pair,
    "car": E.Car,
    "cdr": E.Cdr,
    "List": E.List,
    "::": E.ListCons,
    "rec-List": E.RecList,
    "ind-List": E.IndList,
    "Vec": E.Vec,
    "vec::": E.VecCons,
    "head": E.Head,
    "tail": E.Tail,
    "ind-Vec": E.IndVec,
    "Either": E.Either,
    "left": E.Left,
    "right": E.Right,
    "ind-Either": E.IndEither,
    "=": E.Equal,
    "same": E.Same,
    "symm": E.Symm,
    "replace": E.Replace,
    "trans": E.Trans,
    "cong": E.Cong,
    "ind-=": E.IndEqual
};
