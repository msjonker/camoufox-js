import {
	type Browser,
	type BrowserContext,
	type BrowserType,
	firefox,
} from "playwright-core";

import { type LaunchOptions, launchOptions, syncAttachVD } from "./utils.js";
import { VirtualDisplay } from "./virtdisplay.js";

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
		const screenWidth = launch_options.screen?.maxWidth ?? 1920;
		const screenHeight = launch_options.screen?.maxHeight ?? 1080;

		// Always use Xvfb (X11) for virtual mode — it is proven undetectable.
		// Weston/Wayland leaks detectable signals (GDK_BACKEND, Wayland-specific APIs).
		const virtualDisplay = new VirtualDisplay(debug, screenWidth, screenHeight);
		launch_options.virtual_display = virtualDisplay.get();
		launch_options.screen = {
			...launch_options.screen,
			maxWidth: virtualDisplay.width,
			maxHeight: virtualDisplay.height,
		};
		displayHandle = virtualDisplay;
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
