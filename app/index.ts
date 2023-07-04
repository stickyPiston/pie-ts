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

import { I, V, C, P, T, M } from "../src/index.ts";
// TODO: Add nominal typing to types, so that constructors with similar types
//       are not mixed up during arm reordering
const ast = P.to_ast(`
(data Person
    (Professor (firstname Atom) (lastname Atom) (course Atom))
    (Programmer (firstname Atom) (lastname Atom) (language Atom) (ide Atom))
    (Student (firstname Atom) (lastname Atom))
    (A (name Atom)))
(check-same Atom
    (match (the Person (make-A 'John))
        ((Professor first last course) first)
        ((Programmer first last lang ide) first)
        ((Student student) (car student))
        ((A name) name))
    'John)
`);
console.log(ast.reduce((gamma, x) => x.eval(gamma), I.List() as T.Context));
