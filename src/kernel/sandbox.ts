//import type { ModuleSource as IModuleSource } from "@endo/module-source";
// both module-source and static-module-record dont work properly in the browser, so we'll just use commonjs instead for now (lighter anyway)

declare const __USE_SES__: boolean;

let sandbox_ready = false;
//let ModuleSource: typeof IModuleSource;

export const init_sandbox = async () => {
    if (!__USE_SES__) {
        console.warn("SES is disabled. Sandbox will not be initialised.");
        return;
    }

    if (!sandbox_ready) {
        console.log("Initialising sandbox...");

        await import("ses");
        //ModuleSource = (await import("@endo/module-source")).ModuleSource;
        lockdown();

        sandbox_ready = true;

        console.log("Sandbox initialised.");
    }
}

export const sandbox = (code: string, endowments: Record<string, unknown> = {}) => {
    if (!__USE_SES__) {
        console.warn("Sandboxing is disabled. Executing code without isolation.");

        const func = new Function(...Object.keys(endowments), code);
        return func(...Object.values(endowments));
    }

    if (!sandbox_ready) {
        throw new Error("Sandbox is not initialised. Call init_sandbox() before using the sandbox.");
    }

    const realm = new Compartment(endowments);
    return realm.evaluate(code);
}

export const DEFAULT_PROGRAM_SANDBOX_ENDOWMENTS = {
    // not passing setTimeout/setInterval/clearTimeout/clearInterval to force using process.create_timeout etc instead
    // TODO: could take a process object here and redirect these to it?

    console,

    // TODO: network access via the OS for greater control
    fetch,

    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
    atob,
    btoa,
    structuredClone,

    // TODO: make a limited document accessor to prevent xss attacks in windows. making a custom element class could help representation cross platform too (but limits what works in it)
    document: {
        createElement: document.createElement.bind(document),
        createTextNode: document.createTextNode.bind(document),
        createEvent: document.createEvent.bind(document),
    },

    performance: {
        now: performance.now.bind(performance),
        timeOrigin: performance.timeOrigin,
    }
}

export const import_sandboxed_module = async (code: string, endowments: Record<string, unknown> = DEFAULT_PROGRAM_SANDBOX_ENDOWMENTS) => {
    const fake_module = { exports: {} as Record<string, unknown> };

    if (!__USE_SES__) {
        console.warn("Sandboxing is disabled. Importing module and executing code without isolation.");

        // old esm logic
        // // note: the webpackIgnore bypasses webpack's import() function and uses the browser's native import() function
        // // this is because webpack's import() function does not support data urls
        //
        // const encoded = encodeURIComponent(code);
        // const data_url = `data:text/javascript;charset=utf-8,${encoded}`;
        // return await import(/* webpackIgnore: true */data_url);

        // now using commonjs
        const func = new Function("module", "exports", ...Object.keys(endowments), code);
        func(fake_module, fake_module.exports, ...Object.values(endowments));
        return fake_module.exports;
    }

    if (!sandbox_ready) {
        throw new Error("Sandbox is not initialised. Call init_sandbox() before using the sandbox.");
    }

    const realm = new Compartment({
        ...harden(endowments),

        // commonjs logic (use module.exports endowment)
        module: fake_module,
        exports: fake_module.exports,
    }, {}, {
        // old esm logic
        // resolveHook: specifier => specifier,
        // importHook: async (specifier) => {
        //     // we define a custom module specifier which the code is injected into
        //     if (specifier === "OLLIEOS_DYNAMIC_MODULE") {
        //         return {
        //             source: new ModuleSource(code),
        //         }
        //     }
        //
        //     // disallow all other imports
        //     throw new Error(`Not allowed to import module: ${specifier}`);
        // }
    });

    // old esm logic
    //return await realm.import("OLLIEOS_DYNAMIC_MODULE");

    // evaluate commonjs module
    realm.evaluate(code);

    return fake_module.exports;
}

export const harden_data = <T>(data: T): T => {
    if (!__USE_SES__) {
        console.warn("SES is disabled. Data will only be object frozen, not hardened.");
        return Object.freeze(data);
    }

    if (!sandbox_ready) {
        throw new Error("Sandbox is not initialised. Call init_sandbox() before using harden_data().");
    }

    return harden(data);
}

// TODO: run program code in these sandboxes too! restrict access to raw browser apis
// TODO: new privilege ring (or separate system) that runs code outside of the sandbox (i.e. drivers that run in kernel space to do js browser api stuff)
