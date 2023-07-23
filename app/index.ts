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

import { I, E, V, C, P, T, A } from "../src/index.ts";
// const ast = P.to_ast(`
// (data Person
//     (Professor (firstname Atom) (lastname Atom) (course Atom))
//     (Programmer (firstname Atom) (lastname Atom) (language Atom) (ide Atom))
//     (Student (firstname Atom) (lastname Atom))
//     (A (name Atom)))
// (check-same Atom
//     (match (the Person (make-A 'John))
//         ((Professor first last course) first)
//         ((Programmer first last lang ide) first)
//         ((Student student) (car student))
//         ((A name) name))
//     'John)
// `);
const ast = [
    new T.Data("Person", I.List(), I.List(), I.List([
        new T.Constructor("Professor", I.List([
            { name: "firstname", value: new E.Atom() },
            { name: "lastname", value: new E.Atom() },
            { name: "course", value: new E.Atom() }
        ]), I.List()),
        new T.Constructor("Student", I.List([
            { name: "firstname", value: new E.Atom() },
            { name: "lastname", value: new E.Atom() }
        ]), I.List())
    ])),
    new T.CheckSame(new E.Atom(), new E.Tick("Doe"), new E.Match(
        new E.Appl(new E.Var("Student"), [new E.Tick("John"), new E.Tick("Doe")]),
        I.List([
            new E.Arm(new A.Datatype("Professor", I.List([
                new A.Var("firstname"), new A.Var("lastname"), new A.Var("course")
            ]), undefined), new E.Var("lastname")),
            new E.Arm(new A.Datatype("Student", I.List([
                new A.Atom("Mary"), new A.Var("lastname")
            ]), undefined), new E.Tick("Does")),
            new E.Arm(new A.Datatype("Student", I.List([
                new A.Atom("John"), new A.Atom("Does")
            ]), undefined), new E.Tick("Does")),
            new E.Arm(new A.Datatype("Student", I.List([
                new A.Atom("John"), new A.Var("lastname")
            ]), undefined), new E.Var("lastname")),
            new E.Arm(new A.Hole(), new E.Tick("hole"))
        ])
    ))
];
console.log(ast.reduce((gamma, x) => x.eval(gamma), I.List() as T.Context));
// console.log(context.find(entry => entry.type === "Claim" && entry.name === "Student"));
