import { Command } from "https://deno.land/x/cmd@v1.2.0/mod.ts";
const program = new Command("pie-ts");

program
    .command("run <path>")
    .description("batch run a file")
    .action(path => {

    });

program
    .command("repl")
    .description("open a repl session")
    .action(() => {

    });

program.parse(Deno.args);
