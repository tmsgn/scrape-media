import type { Browser, PuppeteerLaunchOptions } from "puppeteer-core";

export async function launchBrowser(
  options: PuppeteerLaunchOptions = {}
): Promise<Browser> {
  const isServerless = !!(process.env.VERCEL || process.env.AWS_REGION);
  if (isServerless) {
    const { default: chromium } = await import("@sparticuz/chromium");
    const puppeteer = await import("puppeteer-core");

    // Optional: disabling WebGL can reduce overhead on serverless
    try {
      (chromium as any).setGraphicsMode = false;
    } catch {}

    const executablePath = await chromium.executablePath();

    // Merge Puppeteer's defaults with Chromium's recommended flags
    const headless: any = "shell"; // explicit for Puppeteer >= v20
    const mergedArgs = puppeteer.defaultArgs({
      args: [
        ...(Array.isArray((chromium as any).args) ? (chromium as any).args : []),
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
        "--autoplay-policy=no-user-gesture-required",
        "--mute-audio",
        "--ignore-certificate-errors",
        "--allow-running-insecure-content",
      ],
      headless,
    });

    const launchOptions: PuppeteerLaunchOptions = {
      executablePath: executablePath || undefined,
      headless,
      args: mergedArgs,
      defaultViewport: { width: 1366, height: 768, deviceScaleFactor: 1 },
      env: {
        ...process.env,
        LD_LIBRARY_PATH: ["/tmp", process.env.LD_LIBRARY_PATH]
          .filter(Boolean)
          .join(":"),
      },
      ...options,
    } as PuppeteerLaunchOptions;

    return puppeteer.launch(launchOptions);
  }
  // Local / server: use full puppeteer (bundled Chromium)
  const puppeteer = await import("puppeteer");
  return (await puppeteer.launch({
    headless: true,
    ...(options as any),
  })) as unknown as Browser;
}
