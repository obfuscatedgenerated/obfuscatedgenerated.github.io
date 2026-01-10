import "@xterm/xterm/css/xterm.css";

const boot_screen = document.getElementById("boot_screen");

// insert boot loader bars depending on screen size (each bar should take 1/15th of the loader's width, ignoring margins)
const loader = document.getElementById("boot_loader") as HTMLDivElement;
const bar_count = Math.floor(loader.getBoundingClientRect().width / 15);
for (let i = 0; i < bar_count; i++) {
    const bar = document.createElement("div");
    bar.classList.add("boot_loader_bar");

    // make first 3 bars visible
    if (i < 3) {
        bar.style.visibility = "visible";
    }

    loader.appendChild(bar);
}

// animate the loader bars (3 block width, scrolling across the loader with wraparound)
let tail_bar_idx = 0;
const loader_interval = setInterval(() => {
    const bars = document.querySelectorAll(".boot_loader_bar") as NodeListOf<HTMLDivElement>;

    // hide the tail bar
    bars[tail_bar_idx].style.visibility = "hidden";

    // show the next bar
    bars[(tail_bar_idx + 3) % bars.length].style.visibility = "visible";

    // increment the tail bar index, wrapping around if necessary
    tail_bar_idx = (tail_bar_idx + 1) % bars.length;

    // if the boot screen is hidden, stop the animation
    if (boot_screen.style.opacity === "0") {
        clearInterval(loader_interval);
    }
}, 100);

// TODO: move to shell or jetty
//async function check_first_time(term: WrappedTerminal) {
    // TODO: update implementation
    // TODO: use windows rather than sweetalert2
    //// if this is the user's first time, show a popup asking if they want to run the tour
    //if (localStorage.getItem("visited") === null) {
    //    const tour = await Swal.fire({
    //        title: "Welcome to OllieOS!",
    //        html: "<p>It looks like it's your first time here!</p><p>Would you like to run the tour?</p><p>If you select no, you can run the tour later by using the <code>tour</code> command.</p>",
    //        icon: "question",
    //        showCancelButton: true,
    //        confirmButtonText: "Yes",
    //        cancelButtonText: "No",
    //    });
//
    //    const reader = await Swal.fire({
    //        title: "Screen Reader",
    //        html: "<p>Would you like to enable the screen reader?</p><p>Due to a technical limitation, on-screen links will not be clickable in screen reader mode.</p><p>You can toggle the screen reader at any time with the <code>reader</code> command.</p>",
    //        icon: "question",
    //        showCancelButton: true,
    //        confirmButtonText: "Yes",
    //        cancelButtonText: "No",
    //    });
//
    //    term.focus();
//
    //    if (reader.isConfirmed) {
    //        await term.execute("reader");
    //    }
//
    //    if (tour.isConfirmed) {
    //        await term.execute("tour");
    //    }
//
    //    localStorage.setItem("visited", "");
    //} else {
    //    term.focus();
    //}
//
    //term.insert_preline();
//}

async function init_spawned() {
    // fade out the boot screen
    boot_screen.style.opacity = "0";

    if (localStorage.getItem("nointro") === "true") {
        // skip any pauses for transitions
        boot_screen.style.display = "none";
        return;
    }

    // after faded, keep it like that for 500 ms before shrinking it to 0% height
    // then, run the tour if it's the user's first time
    setTimeout(() => {
        boot_screen.style.height = "0";
        setTimeout(() => {
            boot_screen.style.display = "none";
        }, 500);
    }, 1000);
}

const main = async () => {
    console.log("Downloading OS...");

    // lazy load bootloader to create a smaller initial bundle (with the boot screen working right away while the code is downloaded)
    const { boot_os } = await import(
        /* webpackChunkName: "os" */
        "./bootloader"
    );

    console.log("Booting OS...");

    const success = await boot_os(init_spawned);
    if (!success) {
        boot_screen.style.display = "none";
    }
}


if (localStorage.getItem("nointro") === "true") {
    // disable transition on #boot_screen to make it usable faster
    boot_screen.style.transition = "none";

    // the boot screen will show only for as long as it takes to load the terminal
    main();
} else {
// add artificial delay to allow the boot screen to show for a bit
    setTimeout(main, 3000);
}

// TODO: better mobile experience
