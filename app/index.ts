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

import { I, P, T, O } from "../src/index.ts";

const ast = P.parse(await Deno.readTextFile("examples/match.pie"));
// console.log(ast);
console.log(ast.reduce((sigma, x) => x.eval(sigma), new O.Sigma));
