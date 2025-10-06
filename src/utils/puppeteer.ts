import type { Browser } from "puppeteer-core";

// Local alias to avoid version-specific type export differences across puppeteer-core versions
type LaunchOptions = any;

export async function launchBrowser(
  options: LaunchOptions = {}
): Promise<Browser> {
  const isServerless = !!(
    process.env.VERCEL ||
    process.env.VERCEL_ENV ||
    process.env.AWS_REGION ||
    process.env.RENDER
  );
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
    const headless: any = (chromium as any).headless ?? true;
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
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor",
      "--single-process",
      ...extraArgs,
    ];

    const launchOptions: LaunchOptions = {
      executablePath: executablePath || undefined,
      headless,
      args,
      ignoreHTTPSErrors: true,
      protocolTimeout: 60_000,
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
