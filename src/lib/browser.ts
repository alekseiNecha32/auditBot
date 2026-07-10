import type { Browser } from "playwright-core";

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

// Locally we use the full `playwright` package, which manages its own
// downloaded Chromium build for the dev machine's OS. In serverless
// (Vercel/Lambda), that binary isn't available, so we use `playwright-core`
// (no bundled browser) driving a statically-compiled Linux Chromium from
// `@sparticuz/chromium`, the standard pattern for headless Chrome on Lambda.
export async function launchBrowser(): Promise<Browser> {
  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const { chromium: playwrightChromium } = await import("playwright-core");
    return playwrightChromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const { chromium: playwrightChromium } = await import("playwright");
  const browser = await playwrightChromium.launch({ headless: true });
  return browser as unknown as Browser;
}
