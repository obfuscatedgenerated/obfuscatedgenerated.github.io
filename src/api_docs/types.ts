/**
 * @group Program Types
 * @groupDescription Type interfaces for the definition of program files.
 *
 * @category Programs
 */
export {
    Program,
    ProgramMain,
    ProgramMainData,
    ArgDescriptions,
    ProgramGUIProps
} from "../types";

/**
 * @group Program Types
 * @category Completions
 */
export {
    CompletionGenerator,
    CompletionData,
} from "../types";

/**
 * @group Program Types
 * @category Kernel Functions
 */
export {
    KernelFunc,
    KernelFuncs,
    KernelFuncData,
    RequestKernelFunc,
} from "../types";

/**
 * @group Program Types
 * @category Threads
 */
export {
    ThreadFunc,
    ThreadFuncs,
    ThreadData,
    RunThread,
} from "../types";

/**
 * @group Program Types
 * @category Programs
 */
export {
    ProgramSections,
    UserspaceProgramMainData,
} from "../types";
