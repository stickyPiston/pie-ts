import * as E from "./expr.ts";
import * as C from "./core.ts";
import * as V from "./value.ts";
import * as I from "https://deno.land/x/immutable@4.0.0-rc.14-deno/mod.ts";
import * as O from "./context.ts";

type Symbol = O.Symbol;

/**
 * Abstract class for top-level constructs
 */
export interface TopLevel {
    /**
     * Evaluate a top-level statement given some context returning the updated context
     * @param sigma the top-level context so far
     */
    eval(sigma: O.Sigma): O.Sigma;
}

/**
 * Concrete class for (define ...) statement
 */
export class Define implements TopLevel {
    public constructor(public name: Symbol, public value: E.Expr) { }

    /**
     * Check whether there is claim before this define and then check the definition's
     * body against the claimed type to obtain a core expression which can be evaluated and
     * put into the new context
     */
    public eval(sigma: O.Sigma): O.Sigma {
        const claim = sigma.get_all(this.name).findLast(e => e instanceof O.Claim) as O.Claim | undefined;
        const gamma = sigma.to_gamma();
        const core = this.value.check(gamma, claim!.type);
        const value = core.eval(gamma.to_rho());
        return sigma.set(new O.Define(this.name, value));
    }
}

/**
 * Declare a variables type using (claim ...)
 */
export class Claim implements TopLevel {
    public constructor(public name: Symbol, public type: E.Expr) { }

    /**
     * Check whether the body is a type and then add it to the context
     */
    public eval(sigma: O.Sigma): O.Sigma {
        const gamma = sigma.to_gamma();
        const core = this.type.isType(gamma);
        const value = core.eval(gamma.to_rho());
        return sigma.set(new O.Claim(this.name, value));
    }
}

/**
 * To make the language somewhat useful there is a construct to check whether something
 * type checks and it produces the correct value
 */
export class CheckSame implements TopLevel {
    public constructor(
        public type: E.Expr,
        public left: E.Expr,
        public right: E.Expr,
    ) { }

    /**
     * Evaluate the type, check the two expressions against that type and then check the values
     */
    public eval(sigma: O.Sigma): O.Sigma {
        const gamma = sigma.to_gamma(), rho = gamma.to_rho(), bound = rho.to_bound();
        const type_value = this.type.isType(gamma).eval(rho);
        const left_value = this.left.check(gamma, type_value).eval(rho);
        const right_value = this.right.check(gamma, type_value).eval(rho);

        left_value.same_value(rho, bound, type_value, right_value);

        return sigma;
    }
}

type Param = { name: Symbol, expr: E.Expr };

/**
 * A constructor in a datatype definition
 */
// export class Constructor {
//     public constructor(
//         public name: Symbol,
//         public parameters: I.List<Param>,
//         public type_name: Symbol,
//         public type: I.List<E.Expr>
//     ) { }

//     /**
//      * Create a core expression to introduce a constructor
//      * @param gamma the type checking environment of within the datatype
//      * @param datatype the parent datatype's core expression representation
//      * @returns a series of lambdas that lead to the construction of this constructor's core expression
//      */
//     public to_core(gamma: O.Gamma, datatype: C.Datatype): C.Core {
//         const args = this.parameters.map(({ name, value }) => {
//             gamma = gamma.set(name, new V.U());
//             return { expr: new C.Var(name), type: value.isType(gamma) };
//         });
//         const constr: C.Core = new C.Constructor(this.name, args, datatype);
//         return this.parameters.reduceRight((acc, { name }) => new C.Lambda(name, acc), constr);
//     }

//     /**
//      * Create the type for the function created from Constructor.to_core()
//      * @param context the top level context of the data expression
//      * @param datatype the core expression representing the parent datatype
//      * @returns the core expression representing the the result of Constructor.to_core()
//      */
//     public to_type(gamma: O.Gamma, datatype: C.Core): C.Core {
//         const param_types = this.parameters.map(({ name, value }) => {
//             gamma = gamma.set(name, new V.U());
//             return { name, value: value.isType(gamma) };
//         });
//         return param_types.reduceRight((acc, { name, value }) => new C.Pi(name, value, acc), datatype);
//     }

//     /**
//      * Create the associated constructor information in core expression context
//      * @param gamma the type checking environment of within the datatype
//      * @param parameters the datatype's type parameters
//      * @param indices the datatype's indices
//      * @returns a constructor information object
//      */
//     public to_info(gamma: O.Gamma, parameters: I.List<V.Value>, indices: I.List<V.Value>): C.ConstructorInfo {
//         return new C.ConstructorInfo(
//             this.parameters.map(({ name, value }) => {
//                 gamma = gamma.set(name, new V.U());
//                 return { name, value: value.isType(gamma) };
//             }),
//             this.type.zipWith((t, type) => t.check(gamma, type), parameters.concat(indices))
//         );
//     }
// }

export class Constructor {
    public constructor(
        public name: Symbol,
        public parameters: I.List<Param>,
        public type: { name: Symbol, args: I.List<E.Expr> }
    ) { }

    public to_def(data_name: Symbol, gamma: O.Gamma): O.ConstructorDef {
        const telescope = this.parameters
            .map(({ name, expr }) => ({ name, expr }))
            .push({ name: gamma.fresh("ret"), expr: new E.Appl(new E.Var(data_name), this.type.args) });
        return new O.ConstructorDef(this.name, new O.Telescope(telescope));
    }
}

export class Data implements TopLevel {
    public constructor(
        public name: Symbol,
        public parameters: I.List<Param>,
        public indices: I.List<Param>,
        public constructors: I.List<Constructor>
    ) { }

    public eval(sigma: O.Sigma): O.Sigma {
        const gamma = sigma.to_gamma();

        const telescope_entries = this.parameters
            .concat(this.indices)
            .map(({ name, expr }) => ({ name, expr }));
        const telescope = new O.Telescope(telescope_entries);
        
        const pseudo_data = new O.Data(this.name, telescope, I.List());

        pseudo_data.constructors = this.constructors.map(c => c.to_def(this.name, gamma));
        return sigma.set(pseudo_data);
    }
}

/**
 * A datatype definition
 */
// export class Data implements TopLevel {
//     public constructor(
//         public name: Symbol,
//         public parameters: I.List<Param>,
//         public indices: I.List<Param>,
//         public constructors: I.List<Constructor>
//     ) {
//         this.constructors = this.prepend_parameters_to_constructors(constructors);
//     }

//     /**
//      * Create the type of the function generated by Data.to_core()
//      * @param gamma the top level context of the data statement
//      * @returns the pi expressions that represent the function creating this datatype
//      */
//     private to_type(gamma: O.Gamma): C.Core {
//         return this.parameters
//             .concat(this.indices)
//             .map(({ name, value }) => ({ name, value: value.isType(gamma) }))
//             .reduceRight((acc, { name, value }) => new C.Pi(name, value, acc), new C.U());
//     }

//     /**
//      * Create a core expression representation for this datatype
//      * @param gamma the type checking context of within the datatype
//      * @param rho the runtime context of within the datatype
//      * @returns this datatype's core expression representation
//      */
//     private to_datatype(gamma: O.Gamma, rho: O.Rho): C.Datatype {
//         const parameters = Data.eval_parameters(this.parameters, gamma),
//               indices = Data.eval_parameters(this.indices, gamma);
//         const constructors = this.constructors.toMap().mapEntries(([_, c]) => [
//             c.name,
//             c.to_info(
//                 gamma,
//                 parameters.map(({ type }) => type.eval(rho)),
//                 indices.map(({ type }) => type.eval(rho))
//             )]);
//         return new C.Datatype(this.name, parameters, indices, constructors);
//     }

//     /**
//      * Create the function that creates this datatype's type
//      * @param gamma the top level context of the data statement
//      * @returns the core expression for the function creating the datatype's type
//      */
//     private to_core(body: C.Core): C.Core {
//         return this.parameters
//             .concat(this.indices)
//             .reduceRight((acc, { name }) => new C.Lambda(name, acc), body);
//     }

//     /**
//      * Create core expression representations for a datatype's parameters or indices
//      * @param parameters the datatype's parameters or indices
//      * @param gamma the typing context of the datatype (not within)
//      * @returns the parameters' core expression representations
//      */
//     private static eval_parameters(parameters: I.List<Param>, gamma: O.Gamma): I.List<C.DatatypeParameter> {
//         return parameters.map(({ name, value }) => ({ expr: new C.Var(name), type: value.isType(gamma) }));
//     }

//     /**
//      * Extend the typing context with the types for the datatype's parameters and indices
//      * @param gamma the typing context of the datatype
//      * @param rho the runtime context of the datatype
//      * @returns the typing context for within the datatype
//      */
//     private create_constructor_gamma(gamma: O.Gamma, rho: O.Rho): O.Gamma {
//         return this.parameters
//             .concat(this.indices)
//             .reduce(
//                 (gamma, { name, value }) => gamma.set(name, value.isType(gamma).eval(rho)),
//                 gamma
//             );
//     }

//     /**
//      * Extend the runtime context with neutral values for the datatype's parameters and indices
//      * @param rho the runtime context of the datatype
//      * @returns the runtime context for within the datatype
//      */
//     private create_constructor_rho(rho: O.Rho): O.Rho {
//         return this.parameters
//             .concat(this.indices)
//             .reduce((rho, { name }) => rho.set(name, new V.U()), rho);
//     }

//     /**
//      * Prepend the automatically generated parameters for each constructor.
//      * These parameters are for now regular parameters that need values supplied explicitly when called,
//      * but once implicit parameters are implemented, these parameters will also be marked as implicit
//      * @param constructors the original list of constructors
//      * @returns the original list of constructor with the added constructor prepended
//      */
//     private prepend_parameters_to_constructors(constructors: I.List<Constructor>): I.List<Constructor> {
//         return constructors.map(constr => {
//             const new_parameters = this.parameters.concat(constr.parameters);
//             return new Constructor(constr.name, new_parameters, constr.type_name, constr.type);
//         });
//     }

//     /**
//      * A datatype definition introduces the bindings for the type and for each of the constructors
//      */
//     public eval(sigma: O.Sigma): O.Sigma {
//         // This check happens in eval because throwing errors in the constructor happen during parsing
//         // which is not wanted
//         this.check_parameter_consistency();

//         const gamma = sigma.to_gamma(), rho = gamma.to_rho();
//         const constr_gamma = this.create_constructor_gamma(gamma, rho),
//               constr_rho = this.create_constructor_rho(rho);
              
//         const datatype = this.to_datatype(constr_gamma, constr_rho);

//         return this.constructors
//             .reduce((env, constr) => env
//                 .set(new O.Claim(constr.name, constr.to_type(constr_gamma, datatype).eval(constr_rho)))
//                 .set(new O.Define(constr.name, constr.to_core(constr_gamma, datatype).eval(constr_rho))), sigma)
//             .set(new O.Claim(this.name, this.to_type(gamma).eval(rho)))
//             .set(new O.Define(this.name, this.to_core(datatype).eval(rho)));
//     }

//     /**
//      * The parameters in the return types for every constructor should be the same parameters
//      * as the ones defined for the entire datatype. This function checks whether this is true
//      * by verifying that the same variables are used in the correct positions in the return types
//      * in the constructors and that the variables are not shadowed in their parameters.
//      */
//     private check_parameter_consistency(): void {
//         this.constructors.forEach(constr => {
//             // Check that the constructor includes the datatype's name
//             if (constr.type_name !== this.name)
//                 throw new Error("The constructors need to return an instance of the datatype");
        
//             const parameter_names = this.parameters.map(({ name }) => name);
        
//             // Check that the first few parameters are the variables
//             const supposed_parameters = constr.type.slice(0, this.parameters.size);
//             supposed_parameters
//                 .zip(this.parameters.map(({ name }) => name))
//                 .forEach(([expr, name]) => {
//                     if (!(expr instanceof E.Var && expr.name === name)) {
//                         const parameters = parameter_names.join(", ");
//                         throw new Error(`Expected first ${supposed_parameters.size} parameters for constructor ${constr.name} to be ${parameters}`);
//                     }
//                 });

//             // Check that the parameters are not shadowed over by the constructor
//             constr.parameters
//                 .slice(this.parameters.size) // The first few parameters are prepended in Data's constructor
//                 .forEach(({ name }) => {
//                     if (parameter_names.includes(name))
//                         throw new Error(`Shadowing the datatype's parameters is not allowed in constructor ${constr.name}'s parameter ${name}`);
//                 });
//         });
//     }
// }