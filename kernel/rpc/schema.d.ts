export type MemberSchema = {
    kind: "method";
} | {
    kind: "property";
    writable: boolean;
};
export type APISchema = Record<string, MemberSchema>;
export declare const extract_schema: (proxy: object) => APISchema;
