import { Howl } from "howler";
export declare class SoundRegistry {
    #private;
    register_howl(name: string, howl: Howl, ready?: boolean): void;
    register_file(name: string, file: string): void;
    await_ready(name: string, interval?: number): Promise<void>;
    play(name: string): void;
    get(name: string): Howl;
    is_ready(name: string): boolean;
    wait_to_play(name: string, interval?: number): void;
}
