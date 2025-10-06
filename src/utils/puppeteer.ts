import type { Browser, PuppeteerLaunchOptions } from "puppeteer-core";

export async function launchBrowser(
  options: PuppeteerLaunchOptions = {}
): Promise<Browser> {
  const isServerless = !!(process.env.VERCEL || process.env.AWS_REGION);
  if (isServerless) {
    const { default: chromium } = await import("@sparticuz/chromium");
    const puppeteer = await import("puppeteer-core");
    const executablePath = await chromium.executablePath();
    const args = [
      ...chromium.args,
      "--autoplay-policy=no-user-gesture-required",
      "--mute-audio",
      "--ignore-certificate-errors",
      "--allow-running-insecure-content",
    ];
    return puppeteer.launch({
      executablePath: executablePath || undefined,
      headless: chromium.headless,
      args,
      defaultViewport: { width: 1366, height: 768, deviceScaleFactor: 1 },
      ...options,
    });
  }
  // Local / server: use full puppeteer (bundled Chromium)
  const puppeteer = await import("puppeteer");
  return (await puppeteer.launch({
    headless: true,
    ...(options as any),
  })) as unknown as Browser;
}
