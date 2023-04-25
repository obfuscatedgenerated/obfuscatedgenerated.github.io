import { Howl } from "howler";

export class SoundRegistry {
    registry: { [name: string]: { ready: boolean, howl: Howl } } = {};

    register_howl(name: string, howl: Howl, ready = false) {
        this.registry[name] = { ready, howl };
    }

    register_file(name: string, file: string) {
        const howl = new Howl({
            src: [file],
            onload: () => {
                this.registry[name].ready = true;
            },
        });

        this.register_howl(name, howl);
    }

    async await_ready(name: string, interval = 100): Promise<void> {
        return new Promise((resolve, reject) => {
            const timer = setInterval(() => {
                if (this.registry[name].ready) {
                    clearInterval(timer);
                    resolve();
                }
            }, interval);
        });
    }

    play(name: string) {
        if (!(name in this.registry)) {
            throw new Error(`Sound "${name}" is not registered.`);
        }

        if (!this.registry[name].ready) {
            throw new Error(`Sound "${name}" is not ready yet.`);
        }

        this.registry[name].howl.play();
    }

    get(name: string) {
        if (!(name in this.registry)) {
            throw new Error(`Sound "${name}" is not registered.`);
        }

        return this.registry[name].howl;
    }

    is_ready(name: string) {
        return this.registry[name].ready;
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