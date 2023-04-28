import { Howl } from "howler";

export class SoundRegistry {
    _registry: Map<string, { ready: boolean, howl: Howl }> = new Map();

    register_howl(name: string, howl: Howl, ready = false) {
        this._registry.set(name, { ready, howl });
    }

    register_file(name: string, file: string) {
        const howl = new Howl({
            src: [file],
            onload: () => {
                const entry = this._registry.get(name);
                entry.ready = true;
                this._registry.set(name, entry);
            },
        });

        this.register_howl(name, howl);
    }

    async await_ready(name: string, interval = 100): Promise<void> {
        return new Promise((resolve, reject) => {
            const timer = setInterval(() => {
                if (this._registry.get(name).ready) {
                    clearInterval(timer);
                    resolve();
                }
            }, interval);
        });
    }

    play(name: string) {
        if (!this._registry.has(name)) {
            throw new Error(`Sound "${name}" is not registered.`);
        }

        if (!this._registry.get(name).ready) {
            throw new Error(`Sound "${name}" is not ready yet.`);
        }

        this._registry.get(name).howl.play();
    }

    get(name: string) {
        if (!this._registry.has(name)) {
            throw new Error(`Sound "${name}" is not registered.`);
        }

        return this._registry.get(name).howl;
    }

    is_ready(name: string) {
        return this._registry.get(name).ready;
    }

    wait_to_play(name: string, interval = 100) {
        if (this.is_ready(name)) {
            this.play(name);
        } else {
            console.log(`Sound ${name} is not ready yet, waiting...`);
            this.await_ready(name, interval).then(() => {
                this.play(name);
            });
        }
    }
}