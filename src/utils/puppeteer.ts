import type { Browser } from "puppeteer-core";

// Local alias to avoid version-specific type export differences across puppeteer-core versions
type LaunchOptions = any;

export async function launchBrowser(
  options: LaunchOptions = {}
): Promise<Browser> {
  const isServerless = !!(process.env.VERCEL || process.env.AWS_REGION);
  if (isServerless) {
    const { default: chromium } = await import("@sparticuz/chromium");
    const puppeteer = await import("puppeteer-core");

    // If a remote browser is provided, connect instead of launching locally
    const wsEndpoint =
      process.env.PUPPETEER_BROWSER_WS || process.env.BROWSER_WS_ENDPOINT;
    if (wsEndpoint) {
      return puppeteer.connect({
        browserWSEndpoint: wsEndpoint,
        protocolTimeout: 60000,
      }) as unknown as Browser;
    }

    // Optional: disabling WebGL can reduce overhead on serverless
    try {
      (chromium as any).setGraphicsMode = false;
    } catch {}

    // If using the standard package, this extracts to /tmp; alternatively, a remote pack can be provided.
    const packUrl = process.env.CHROMIUM_PACK_URL;
    const executablePath = await chromium.executablePath(packUrl);

    // Merge Puppeteer's defaults with Chromium's recommended flags
    const headless: any = "shell"; // explicit for Puppeteer >= v20
    const mergedArgs = puppeteer.defaultArgs({
      args: Array.isArray((chromium as any).args) ? (chromium as any).args : [],
      headless,
    });

  const launchOptions: LaunchOptions = {
      executablePath: executablePath || undefined,
      headless,
      args: mergedArgs,
      defaultViewport: { width: 1366, height: 768, deviceScaleFactor: 1 },
      env: {
        ...process.env,
        LD_LIBRARY_PATH: [
          "/tmp",
          "/var/task",
          "/var/task/node_modules/@sparticuz/chromium/bin",
          "/usr/lib64",
          "/lib64",
          process.env.LD_LIBRARY_PATH,
        ]
          .filter(Boolean)
          .join(":"),
        FONTCONFIG_PATH: process.env.FONTCONFIG_PATH || "/tmp",
        TMPDIR: process.env.TMPDIR || "/tmp",
        HOME: process.env.HOME || "/tmp",
        XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || "/tmp",
      },
      ...options,
    } as LaunchOptions;

    return puppeteer.launch(launchOptions);
  }
  // Local / server: use full puppeteer (bundled Chromium)
  const puppeteer = await import("puppeteer");
  return (await puppeteer.launch({
    headless: true,
    ...(options as any),
  })) as unknown as Browser;
}
