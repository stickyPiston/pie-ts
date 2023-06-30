// import Denomander from "https://deno.land/x/denomander@0.9.3/mod.ts";
// import { I, P, T } from "../src/index.ts";

// new Denomander({
//     app_name: "pie-ts",
// })
//     .command("run [path]")
//     .action(async ({ path }: { path: string }) => {
//         const content = await Deno.readTextFile(path);
//         P.to_ast(content).reduce(
//             (gamma, x) => x.eval(gamma),
//             I.List() as T.Context,
//         );
//     })
//     .parse(Deno.args);

import { I, V, C, P, T } from "../src/index.ts";
const ast = P.to_ast(`
(data Person
    (Professor (firstname Atom) (lastname Atom) (course Atom))
    (Programmer (firstname Atom) (lastname Atom) (language Atom) (ide Atom))
    (Student (firstname Atom) (lastname Atom) (school Atom)))
(claim John Person)
(define John (make-Programmer 'John 'Doe 'Pie 'VScode))
`);
// `
// (check-same Atom
//     (match (the Person (make-Professor 'John 'Doe 'Logic))
//         ((Professor first last course) first)
//         ((Programmer first last lang ide) first))
//     'John)
// `
console.log(ast.reduce((gamma, x) => x.eval(gamma), I.List() as T.Context));
// ast.reduce(
//     (gamma, x) => x.eval(gamma),
//     I.List() as T.Context,
// );
// ast[0].eval(I.List([
//     { name: "a", type: "Claim", value: new V.Coproduct(new V.Sigma("x", new V.Atom(), new V.Closure(I.Map() as V.Rho, new C.Atom())), new V.Coproduct(new V.Atom(), new V.Pi("x", new V.Atom(), new V.Closure(I.Map() as V.Rho, new C.Atom())))) },
//     { name: "a", type: "Define", value: new V.Inr(new V.Inl(new V.Tick("hello"))) }
// ]));
