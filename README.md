# camoufox-js

This is the JavaScript client for Camoufox. It is a port of the Python wrapper (doesn't call the original Python scripts).

## Installation

```bash
npm install camoufox-js
```

## Usage 

You can launch Playwright-controlled Camoufox using this package like this:

```javascript
import { Camoufox } from 'camoufox-js';

// you might need to run `npx camoufox-js fetch` to download the browser after installing the package

const browser = await Camoufox({
    // custom camoufox options
});
            
const page = await browser.newPage(); // `page` is a Playwright Page instance
```

Alternatively, if you want to use additional Playwright launch options, you can launch the Camoufox instance like this:

```javascript
import { launchOptions } from 'camoufox-js';
import { firefox } from 'playwright-core';

// you might need to run `npx camoufox-js fetch` to download the browser after installing the package

const browser = await firefox.launch({
    ...await launchOptions({ /* Camoufox options */ }),
    // other Playwright options, overriding the Camoufox options
});
            
const page = await browser.newPage(); // `page` is a Playwright Page instance
```

### Launching a Camoufox server

Camoufox can be ran as a remote websocket server. It can be accessed from other devices, and languages other than Python supporting the Playwright API.

```javascript
import { launchServer } from 'camoufox-js';
import { firefox } from 'playwright-core';

// you might need to run `npx camoufox-js fetch` to download the browser after installing the package

const server = await launchServer({ port: 8888, ws_path: '/camoufox' });
const browser = await firefox.connect(server.wsEndpoint());

const page = await browser.newPage();

// ...
// Use your browser instance as usual
// ...

await browser.close();  
await server.close(); // Close the server when done
```

## Virtual Display (Headless Mode)

When using `headless: "virtual"`, Camoufox runs inside a virtual X11 display using [Xvfb](https://www.x.org/releases/X11R7.6/doc/man/man1/Xvfb.1.xhtml). This is required even on Wayland-based systems.

### Prerequisites

Install Xvfb if it is not already available:

```bash
# Debian/Ubuntu
sudo apt-get install -y xvfb

# Fedora
sudo dnf install -y xorg-x11-server-Xvfb

# Arch
sudo pacman -S xorg-server-xvfb
```

> **Note for Wayland-only environments:** Camoufox intentionally uses Xvfb (X11) instead of a Wayland compositor for virtual display mode, as this avoids detection by bot-protection services. Xvfb does not require a running X11 desktop session — it creates a standalone virtual X server.

### Usage

```javascript
const browser = await Camoufox({
    headless: "virtual",
});
```

## More info

See https://camoufox.com/ or https://github.com/daijro/camoufox for more information on Camoufox.


