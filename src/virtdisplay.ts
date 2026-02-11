import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { randomInt } from "node:crypto";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { globSync } from "glob";
import {
	CannotExecuteXvfb,
	CannotFindXvfb,
	CannotExecuteWeston,
	CannotFindWeston,
	VirtualDisplayNotSupported,
} from "./exceptions.js";
import { OS_NAME } from "./pkgman.js";

export class VirtualDisplay {
	private debug: boolean;
	private proc: ChildProcess | null = null;
	private _display: number | null = null;
	// private _lock = new Lock();

	constructor(debug: boolean = false) {
		this.debug = debug;
	}

	private get xvfb_args(): string[] {
		return [
			"-screen",
			"0",
			"1x1x24",
			"-ac",
			"-nolisten",
			"tcp",
			"-extension",
			"RENDER",
			"+extension",
			"GLX",
			"-extension",
			"COMPOSITE",
			"-extension",
			"XVideo",
			"-extension",
			"XVideo-MotionCompensation",
			"-extension",
			"XINERAMA",
			"-shmem",
			"-fp",
			"built-ins",
			"-nocursor",
			"-br",
		];
	}

	private get xvfb_path(): string {
		const path = execFileSync("which", ["Xvfb"]).toString().trim();
		if (!path) {
			throw new CannotFindXvfb("Please install Xvfb to use headless mode.");
		}
		if (!existsSync(path) || !execFileSync("test", ["-x", path])) {
			throw new CannotExecuteXvfb(
				`I do not have permission to execute Xvfb: ${path}`,
			);
		}
		return path;
	}

	private get xvfb_cmd(): string[] {
		return [this.xvfb_path, `:${this.display}`, ...this.xvfb_args];
	}

	private execute_xvfb(): void {
		if (this.debug) {
			console.log("Starting virtual display:", this.xvfb_cmd.join(" "));
		}
		this.proc = spawn(this.xvfb_cmd[0], this.xvfb_cmd.slice(1), {
			stdio: this.debug ? "inherit" : "ignore",
			detached: true,
		});
	}

	public get(): string {
		VirtualDisplay.assert_linux();

		// this._lock.runExclusive(() => {
		if (!this.proc) {
			this.execute_xvfb();
		} else if (this.debug) {
			console.log(`Using virtual display: ${this.display}`);
		}
		// });

		return `:${this.display}`;
	}

	public kill(): void {
		// this._lock.runExclusive(() => {
		if (this.proc && !this.proc.killed) {
			if (this.debug) {
				console.log("Terminating virtual display:", this.display);
			}
			this.proc.kill();
		}
		// });
	}

	/**
	 * Get list of lock files in /tmp
	 * @returns List of lock file paths
	 */
	public static _get_lock_files(): string[] {
		const tmpd = process.env.TMPDIR || tmpdir();
		try {
			return globSync(path.join(tmpd, ".X*-lock")).filter((p) => {
				try {
					return statSync(p).isFile();
				} catch {
					return false;
				}
			});
		} catch {
			return [];
		}
	}

	private static _free_display(): number {
		const ls = VirtualDisplay._get_lock_files().map((x) =>
			parseInt(x.split("X")[1].split("-")[0], 10),
		);
		return ls.length ? Math.max(99, Math.max(...ls) + randomInt(3, 20)) : 99;
	}

	private get display(): number {
		if (this._display === null) {
			this._display = VirtualDisplay._free_display();
		}
		return this._display;
	}

	private static assert_linux(): void {
		if (OS_NAME !== "lin") {
			throw new VirtualDisplayNotSupported(
				"Virtual display is only supported on Linux.",
			);
		}
	}
}

export class WaylandVirtualDisplay {
	private debug: boolean;
	private proc: ChildProcess | null = null;
	private _socketName: string | null = null;
	private _runtimeDir: string | null = null;

	constructor(debug: boolean = false) {
		this.debug = debug;
	}

	private static assert_linux(): void {
		if (OS_NAME !== "lin") {
			throw new VirtualDisplayNotSupported(
				"Virtual display is only supported on Linux.",
			);
		}
	}

	private static sleepSync(ms: number): void {
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
	}

	private get weston_path(): string {
		const path = execFileSync("which", ["weston"]).toString().trim();
		if (!path) {
			throw new CannotFindWeston(
				"Please install weston to use Wayland headless mode.",
			);
		}
		if (!existsSync(path) || !execFileSync("test", ["-x", path])) {
			throw new CannotExecuteWeston(
				`I do not have permission to execute weston: ${path}`,
			);
		}
		return path;
	}

	private get socketName(): string {
		if (!this._socketName) {
			this._socketName = `wayland-${randomInt(100, 99999)}`;
		}
		return this._socketName;
	}

	public get runtimeDir(): string {
		if (!this._runtimeDir) {
			const base = process.env.TMPDIR || tmpdir();
			this._runtimeDir = path.join(
				base,
				`camoufox-weston-${process.pid}-${randomInt(100, 99999)}`,
			);
			mkdirSync(this._runtimeDir, { recursive: true, mode: 0o700 });
		}
		return this._runtimeDir;
	}

	private get socketPath(): string {
		return path.join(this.runtimeDir, this.socketName);
	}

	private get weston_cmd(): string[] {
		return [
			this.weston_path,
			"--backend=headless-backend.so",
			"--use-pixman",
			`--socket=${this.socketName}`,
			"--width=1280",
			"--height=720",
		];
	}

	private execute_weston(): void {
		if (this.debug) {
			console.log(
				"Starting Wayland virtual display:",
				this.weston_cmd.join(" "),
			);
		}
		this.proc = spawn(this.weston_cmd[0], this.weston_cmd.slice(1), {
			stdio: this.debug ? "inherit" : "ignore",
			detached: true,
			env: {
				...process.env,
				XDG_RUNTIME_DIR: this.runtimeDir,
				WAYLAND_DISPLAY: this.socketName,
				LIBGL_ALWAYS_SOFTWARE: "1",
			},
		});

		const start = Date.now();
		while (Date.now() - start < 5000) {
			try {
				if (existsSync(this.socketPath) && statSync(this.socketPath).isSocket()) {
					return;
				}
			} catch {
				// ignore
			}
			WaylandVirtualDisplay.sleepSync(50);
		}
		throw new CannotExecuteWeston(
			`Weston did not create WAYLAND_DISPLAY socket at ${this.socketPath}`,
		);
	}

	public get(): string {
		WaylandVirtualDisplay.assert_linux();
		if (!this.proc) {
			this.execute_weston();
		} else if (this.debug) {
			console.log(`Using Wayland virtual display: ${this.socketName}`);
		}
		return this.socketName;
	}

	public kill(): void {
		if (this.proc && !this.proc.killed) {
			if (this.debug) {
				console.log("Terminating Wayland virtual display:", this.socketName);
			}
			this.proc.kill();
		}
		if (this._runtimeDir) {
			try {
				rmSync(this._runtimeDir, { recursive: true, force: true });
			} catch {
				// ignore
			}
		}
	}
}
