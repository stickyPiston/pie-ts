import * as T from "./toplevel.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";
import * as P from "./parse.ts";

P.to_ast(`
(claim length (-> (List Nat) Nat))
(define length (lambda (l) (rec-List l 0 (lambda (e es n) (add1 n)))))
(check-same Nat (length (:: 1 (:: 2 nil))) 2)
`).reduce((gamma, x) => x.eval(gamma), I.List() as T.Context);
