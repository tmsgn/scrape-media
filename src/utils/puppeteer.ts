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
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    // If a remote browser is provided, connect instead of launching locally
    const wsEndpoint =
      process.env.PUPPETEER_BROWSER_WS || process.env.BROWSER_WS_ENDPOINT;
    if (wsEndpoint) {
      return puppeteer.connect({
        browserWSEndpoint: wsEndpoint,
        protocolTimeout: 60000,
      }) as unknown as Browser;
    }

    // If using the standard package, this extracts to /tmp; alternatively, a remote pack can be provided.
    const packUrl = process.env.CHROMIUM_PACK_URL;
    const executablePath = await chromium.executablePath(packUrl);

    // Housekeeping: clean up previous temp/user data to avoid filling /tmp
    try {
      const tmp = process.env.TMPDIR || "/tmp";
      const toRemove = [
        path.join(tmp, "puppeteer_dev_profile"),
        path.join(tmp, "puppeteer"),
        path.join(tmp, "corejs"),
        path.join(tmp, ".org.chromium.Chromium"),
      ];
      await Promise.all(
        toRemove.map(async (p) => {
          try {
            await fs.rm(p, { recursive: true, force: true });
          } catch {}
        })
      );
    } catch {}

    // Use Sparticuz-recommended launch settings for serverless platforms
    // Note: Puppeteer >= v20 supports boolean headless for Chromium in Lambda/Vercel
    const headless: any = true;
    const chromiumArgs: string[] = Array.isArray((chromium as any).args)
      ? (chromium as any).args
      : [];
    const extraArgs: string[] = Array.isArray((options as any)?.args)
      ? ((options as any).args as string[])
      : [];
    const args = [
      ...chromiumArgs,
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      ...extraArgs,
    ];

    const launchOptions: LaunchOptions = {
      executablePath: executablePath || undefined,
      headless,
      args,
      defaultViewport: { width: 1366, height: 768, deviceScaleFactor: 1 },
      ignoreHTTPSErrors: true,
      protocolTimeout: 60_000,
      userDataDir: (process.env.TMPDIR || "/tmp") + "/puppeteer_dev_profile",
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
