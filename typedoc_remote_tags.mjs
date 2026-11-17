// tags each member of a userspace proxy interface with how an isolated program calls it (Sync, Await or Fire And Forget),
// worked out from the same annotations Remote<T> uses, so the docs can't drift from the types.
// the signatures themselves stay as declared, which is how kernelspace code calls them
import {Comment, CommentTag, Converter, ReflectionKind} from "typedoc";
import ts from "typescript";

const TAGS = {
    sync: "@sync",
    await: "@await",
    fire_and_forget: "@fireAndForget",
};

const BRAND_NAMES = ["sync_members", "remote_as_declared"];

// a block under each Await member, spelling out the signature a userspace program sees
const USERSPACE_SIGNATURE_TAG = "@userspace";

// the member names a brand lists, e.g. readonly [sync_members]?: (member: "pid" | "cwd") => void
const brand_members = (checker, properties, brand_name) => {
    const brand = properties.find((property) => property.escapedName.startsWith(`__@${brand_name}@`));
    if (!brand) {
        return null;
    }

    const brand_type = checker.getNonNullableType(checker.getTypeOfSymbol(brand));
    const parameter = brand_type.getCallSignatures()[0]?.getParameters()[0];
    if (!parameter) {
        return new Set();
    }

    const parameter_type = checker.getTypeOfSymbol(parameter);
    const member_types = parameter_type.isUnion() ? parameter_type.types : [parameter_type];

    return new Set(member_types.filter((member_type) => member_type.isStringLiteral()).map((member_type) => member_type.value));
};

const returns_void = (checker, member_type) => {
    const signature = member_type.getCallSignatures()[0];
    return signature !== undefined && (checker.getReturnTypeOfSignature(signature).flags & ts.TypeFlags.Void) !== 0;
};

const returns_promise = (checker, member_type) => {
    const signature = member_type.getCallSignatures()[0];
    const return_type = signature ? checker.getReturnTypeOfSignature(signature) : member_type;
    return return_type.getSymbol()?.getName() === "Promise";
};

// mirrors RemoteMember in kernel/rpc/remote.ts
const classify = (checker, member_name, member_type, sync_members, declared_members) => {
    const is_function = member_type.getCallSignatures().length > 0;

    if (declared_members.has(member_name)) {
        if (returns_promise(checker, member_type)) {
            return TAGS.await;
        }

        return is_function && returns_void(checker, member_type) ? TAGS.fire_and_forget : TAGS.sync;
    }

    // read without crossing to the kernel, but some (e.g. wait_for_timeout) still hand back a promise
    if (sync_members.has(member_name)) {
        return returns_promise(checker, member_type) ? TAGS.await : TAGS.sync;
    }

    return is_function && returns_void(checker, member_type) ? TAGS.fire_and_forget : TAGS.await;
};

const add_modifier_tag = (reflection, tag) => {
    reflection.comment ??= new Comment();
    reflection.comment.modifierTags.add(tag);
};

const is_promise = (type) => (type?.toString() ?? "").startsWith("Promise<");

const describe_parameter = (parameter) => {
    const rest = parameter.flags.isRest ? "..." : "";
    const optional = parameter.flags.isOptional ? "?" : "";
    return `${rest}${parameter.name}${optional}: ${parameter.type?.toString() ?? "unknown"}`;
};

const add_userspace_block = (reflection, line) => {
    reflection.comment ??= new Comment();
    reflection.comment.blockTags.push(new CommentTag(USERSPACE_SIGNATURE_TAG, [
        {kind: "code", text: "```ts\n" + line + "\n```"},
    ]));
};

// spells out an Await member's userspace signature, where it differs from the declared one (it returns a promise of what it declares)
const add_userspace_signature = (reflection) => {
    if (!reflection.signatures?.length) {
        if (!is_promise(reflection.type)) {
            add_userspace_block(reflection, `${reflection.name}: Promise<${reflection.type?.toString() ?? "unknown"}>`);
        }

        return;
    }

    // methods are documented per signature, so each gets its own
    for (const signature of reflection.signatures) {
        if (is_promise(signature.type)) {
            continue;
        }

        const parameters = (signature.parameters ?? []).map(describe_parameter).join(", ");
        add_userspace_block(signature, `${reflection.name}(${parameters}): Promise<${signature.type?.toString() ?? "unknown"}>`);
    }
};

/** @param {import("typedoc").Application} app */
export const load = (app) => {
    // register the tags (keeping the defaults), so typedoc renders them
    app.on("bootstrapEnd", () => {
        const modifier_tags = app.options.getValue("modifierTags");
        app.options.setValue("modifierTags", [...new Set([...modifier_tags, ...Object.values(TAGS)])]);

        const block_tags = app.options.getValue("blockTags");
        app.options.setValue("blockTags", [...new Set([...block_tags, USERSPACE_SIGNATURE_TAG])]);
    });

    // tags by interface, worked out while the typescript symbols are available
    const tags_by_interface = new Map();

    app.converter.on(Converter.EVENT_CREATE_DECLARATION, (context, reflection) => {
        if (!reflection.kindOf(ReflectionKind.Interface)) {
            return;
        }

        const symbol = context.getSymbolFromReflection(reflection);
        if (!symbol) {
            return;
        }

        const checker = context.checker;
        const properties = checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol));

        const sync_members = brand_members(checker, properties, "sync_members");
        if (sync_members === null) {
            // not a userspace proxy interface
            return;
        }

        const declared_members = brand_members(checker, properties, "remote_as_declared") ?? new Set();

        const tags = new Map();
        for (const property of properties) {
            const name = property.getName();
            if (property.escapedName.startsWith("__@")) {
                continue;
            }

            tags.set(name, classify(checker, name, checker.getTypeOfSymbol(property), sync_members, declared_members));
        }

        tags_by_interface.set(reflection, tags);
    });

    app.converter.on(Converter.EVENT_RESOLVE_END, (context) => {
        for (const [reflection, tags] of tags_by_interface) {
            for (const child of [...(reflection.children ?? [])]) {
                // the brands only exist in types, so they aren't documented
                if (BRAND_NAMES.some((brand_name) => child.name === `[${brand_name}]`)) {
                    context.project.removeReflection(child);
                    continue;
                }

                const tag = tags.get(child.name);
                if (tag) {
                    add_modifier_tag(child, tag);
                }

                // only Await members differ from their declared signature
                if (tag === TAGS.await) {
                    add_userspace_signature(child);
                }
            }
        }

        tags_by_interface.clear();
    });
};
