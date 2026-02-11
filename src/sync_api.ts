import {
	type Browser,
	type BrowserContext,
	type BrowserType,
	firefox,
} from "playwright-core";

import { type LaunchOptions, launchOptions, syncAttachVD } from "./utils.js";
import { VirtualDisplay, WaylandVirtualDisplay } from "./virtdisplay.js";

function isWaylandSession(): boolean {
	if (process.env.XDG_SESSION_TYPE === "wayland") {
		return true;
	}
	if (process.env.XDG_SESSION_TYPE === "x11") {
		return false;
	}
	// Fallback: if WAYLAND_DISPLAY is set, assume Wayland
	return !!process.env.WAYLAND_DISPLAY;
}

export async function Camoufox<
	UserDataDir extends string | undefined = undefined,
	ReturnType = UserDataDir extends string ? BrowserContext : Browser,
>(
	launch_options:
		| LaunchOptions
		| { headless?: boolean | "virtual"; user_data_dir: UserDataDir } = {},
): Promise<ReturnType> {
	const { headless, user_data_dir, ...launchOptions } = launch_options;
	return NewBrowser(
		firefox,
		headless,
		{},
		user_data_dir ?? false,
		false,
		launchOptions,
	);
}

export async function NewBrowser<
	UserDataDir extends string | false = false,
	ReturnType = UserDataDir extends string ? BrowserContext : Browser,
>(
	playwright: BrowserType<Browser>,
	headless: boolean | "virtual" = false,
	fromOptions: Record<string, any> = {},
	userDataDir: UserDataDir = false as UserDataDir,
	debug: boolean = false,
	launch_options: LaunchOptions = {},
): Promise<ReturnType> {
	let displayHandle: { kill(): void } | null = null;

	if (headless === "virtual") {
		const useWayland = isWaylandSession();
		if (useWayland) {
			const waylandVirtualDisplay = new WaylandVirtualDisplay(debug);
			launch_options.wayland_display = waylandVirtualDisplay.get();
			launch_options.xdg_runtime_dir = waylandVirtualDisplay.runtimeDir;
			displayHandle = waylandVirtualDisplay;
		} else {
			const virtualDisplay = new VirtualDisplay(debug);
			launch_options.virtual_display = virtualDisplay.get();
			displayHandle = virtualDisplay;
		}
		launch_options.headless = false;
	} else {
		launch_options.headless ||= headless;
	}

	if (!fromOptions || Object.keys(fromOptions).length === 0) {
		fromOptions = await launchOptions({ debug, ...launch_options });
	}

	if (typeof userDataDir === "string") {
		const context = await playwright.launchPersistentContext(
			userDataDir,
			fromOptions,
		);
		return syncAttachVD(context, displayHandle);
	}

	const browser = await playwright.launch(fromOptions);
	return syncAttachVD(browser, displayHandle);
}
