export type MemberSchema =
    | { kind: "method" }
    | { kind: "property"; writable: boolean };

export type APISchema = Record<string, MemberSchema>;

export const extract_schema = (proxy: object): APISchema => {
    const schema: APISchema = Object.create(null);

    for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(proxy))) {
        if (typeof descriptor.value === "function") {
            schema[name] = { kind: "method" };
        } else if (descriptor.get) {
            schema[name] = { kind: "property", writable: Boolean(descriptor.set) };
        }
    }

    return schema;
};
