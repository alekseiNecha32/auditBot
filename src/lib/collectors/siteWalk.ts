import type { Browser, Page } from "playwright-core";
import { launchBrowser } from "@/lib/browser";
import type { CheckoutWalkStep, DeviceWalkResult, SiteWalkResult, WalkStepName } from "@/lib/types";

// SAFETY BOUNDARY: this walk only ever *clicks* pre-existing navigation
// elements (links/buttons). It never calls page.fill()/type() on any input,
// so it can never submit real or fake customer/payment data anywhere. It is
// only ever run against the URL the user themselves submitted for audit.

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const SHOP_TEXT_PATTERNS = [/shop/i, /order( now)?/i, /flowers/i, /arrangements/i, /bouquets/i, /products/i, /browse/i, /same.?day/i];
const SHOP_HREF_PATTERNS = [/shop/i, /collections/i, /products/i, /catalog/i, /store/i, /flowers/i];

const PRODUCT_TEXT_PATTERNS = [/view/i, /details/i, /select options/i];
const PRODUCT_HREF_PATTERNS = [/product/i, /-p-\d/i, /\/item/i];

const ADD_TO_CART_PATTERNS = [/add to cart/i, /add to bag/i, /add to basket/i, /^order now$/i, /select options/i, /buy now/i];

const CART_TEXT_PATTERNS = [/^cart$/i, /view cart/i, /^bag$/i, /^basket$/i, /shopping cart/i];
const CART_HREF_PATTERNS = [/cart/i, /bag/i, /basket/i];

const CHECKOUT_TEXT_PATTERNS = [/checkout/i, /proceed to checkout/i];
const CHECKOUT_HREF_PATTERNS = [/checkout/i];

const GUEST_TEXT_MARKERS = [/guest checkout/i, /checkout as (a )?guest/i, /continue as guest/i];
const ACCOUNT_REQUIRED_MARKERS = [/create an account to continue/i, /sign in to continue/i, /log in to continue/i, /please log in/i, /register to continue/i];
const PAYMENT_MARKERS = [/card number/i, /credit card/i, /payment method/i, /expiration date/i, /\bcvv\b/i, /\bcvc\b/i, /billing address/i];

interface Candidate {
  index: number;
  text: string;
  href: string;
  visible: boolean;
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function getCandidates(page: Page): Promise<Candidate[]> {
  return page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("a, button"));
    return els.map((el, index) => {
      const rect = el.getBoundingClientRect();
      const anchor = el as HTMLAnchorElement;
      return {
        index,
        text: (el.textContent || "").trim().slice(0, 120),
        href: anchor.href || "",
        visible: rect.width > 0 && rect.height > 0,
      };
    });
  });
}

async function clickFirstMatch(
  page: Page,
  textPatterns: RegExp[],
  hrefPatterns: RegExp[] = []
): Promise<{ clicked: boolean; matchedText?: string }> {
  const candidates = await getCandidates(page);
  const match = candidates.find(
    (c) => c.visible && (textPatterns.some((p) => p.test(c.text)) || hrefPatterns.some((p) => p.test(c.href)))
  );
  if (!match) return { clicked: false };
  try {
    const locator = page.locator("a, button").nth(match.index);
    await locator.scrollIntoViewIfNeeded({ timeout: 2000 });
    await locator.click({ timeout: 4000 });
    return { clicked: true, matchedText: match.text || match.href };
  } catch {
    return { clicked: false };
  }
}

async function pageContainsAny(page: Page, patterns: RegExp[]): Promise<boolean> {
  try {
    const text = await page.evaluate(() => document.body?.innerText ?? "");
    return patterns.some((p) => p.test(text));
  } catch {
    return false;
  }
}

async function walkDevice(browser: Browser, url: string, device: "mobile" | "desktop"): Promise<DeviceWalkResult> {
  const steps: CheckoutWalkStep[] = [];
  const friction: string[] = [];
  let furthestStep: WalkStepName | null = null;
  let error: string | null = null;

  const record = (step: WalkStepName, success: boolean, detail: string) => {
    steps.push({ step, success, detail });
    if (success) furthestStep = step;
  };

  const context = await browser.newContext(
    device === "mobile"
      ? { viewport: { width: 390, height: 844 }, userAgent: MOBILE_UA, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } }
  );
  const page = await context.newPage();

  try {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      record("homepage", true, `Loaded ${url}`);
    } catch (err) {
      record("homepage", false, `Failed to load homepage: ${msg(err)}`);
      error = msg(err);
      return { device, steps, furthestStep, friction, error };
    }

    const shopEntry = await clickFirstMatch(page, SHOP_TEXT_PATTERNS, SHOP_HREF_PATTERNS);
    if (!shopEntry.clicked) {
      record("found_shop_entry", false, "Couldn't find a shop/order/products link from the homepage.");
      friction.push("No obvious path from the homepage into a product catalog was found.");
      return { device, steps, furthestStep, friction, error };
    }
    record("found_shop_entry", true, `Clicked "${shopEntry.matchedText}"`);
    await page.waitForLoadState("domcontentloaded").catch(() => {});

    let addResult = await clickFirstMatch(page, ADD_TO_CART_PATTERNS);
    if (addResult.clicked) {
      record("product_page", true, "Product could be added to cart directly from the catalog/listing page.");
    } else {
      const productClick = await clickFirstMatch(page, PRODUCT_TEXT_PATTERNS, PRODUCT_HREF_PATTERNS);
      if (!productClick.clicked) {
        record("product_page", false, "Couldn't find an individual product to open from the catalog page.");
        friction.push("No clickable product tile/link was found on the shop page.");
        return { device, steps, furthestStep, friction, error };
      }
      record("product_page", true, `Opened product via "${productClick.matchedText}"`);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      addResult = await clickFirstMatch(page, ADD_TO_CART_PATTERNS);
    }

    if (!addResult.clicked) {
      record("added_to_cart", false, "Couldn't find an \"Add to Cart\" button on the product page.");
      friction.push("No working add-to-cart control was found.");
      return { device, steps, furthestStep, friction, error };
    }
    record("added_to_cart", true, `Clicked "${addResult.matchedText}"`);
    await page.waitForTimeout(1200);

    const cartClick = await clickFirstMatch(page, CART_TEXT_PATTERNS, CART_HREF_PATTERNS);
    if (!cartClick.clicked) {
      record("viewed_cart", false, "Couldn't find a cart link/icon after adding an item.");
      friction.push("No visible cart link was found after adding an item to the cart.");
      return { device, steps, furthestStep, friction, error };
    }
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    const emptyCart = await pageContainsAny(page, [/cart is empty/i, /your bag is empty/i, /no items/i]);
    if (emptyCart) {
      record("viewed_cart", false, "Cart page loaded but appears empty; the item may not have persisted.");
      friction.push("Item added to cart did not appear to persist to the cart page.");
      return { device, steps, furthestStep, friction, error };
    }
    record("viewed_cart", true, `Viewed cart via "${cartClick.matchedText}"`);

    const checkoutClick = await clickFirstMatch(page, CHECKOUT_TEXT_PATTERNS, CHECKOUT_HREF_PATTERNS);
    if (!checkoutClick.clicked) {
      record("reached_checkout", false, "Couldn't find a checkout button from the cart page.");
      friction.push("No visible checkout button was found on the cart page.");
      return { device, steps, furthestStep, friction, error };
    }
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    record("reached_checkout", true, `Reached checkout via "${checkoutClick.matchedText}"`);

    const guestAvailable = await pageContainsAny(page, GUEST_TEXT_MARKERS);
    const accountRequired = await pageContainsAny(page, ACCOUNT_REQUIRED_MARKERS);
    if (guestAvailable) {
      record("guest_checkout_available", true, "Checkout page offers a guest checkout option.");
    } else if (accountRequired) {
      record("account_required", true, "Checkout appears to require creating an account or logging in.");
      friction.push("Checkout requires an account/login; no guest checkout option was detected.");
    }

    const paymentVisible = await pageContainsAny(page, PAYMENT_MARKERS);
    if (paymentVisible) {
      record("reached_payment_stage", true, "Payment fields are visible on the checkout page (not interacted with, per audit safety rules).");
    }

    return { device, steps, furthestStep, friction, error };
  } catch (err) {
    error = msg(err);
    return { device, steps, furthestStep, friction, error };
  } finally {
    await context.close().catch(() => {});
  }
}

export async function runSiteWalk(url: string): Promise<SiteWalkResult> {
  const notes: string[] = [];
  let browser: Browser | null = null;
  try {
    browser = await launchBrowser();
    const [desktop, mobile] = await Promise.all([
      walkDevice(browser, url, "desktop"),
      walkDevice(browser, url, "mobile"),
    ]);

    const reachedCheckout = (d: DeviceWalkResult | null) =>
      d?.steps.some((s) => s.step === "reached_checkout" && s.success) ?? false;

    return {
      attempted: true,
      desktop,
      mobile,
      onlineOrderingConfirmed: reachedCheckout(desktop) || reachedCheckout(mobile),
      notes,
    };
  } catch (err) {
    notes.push(`Couldn't run the ordering-flow walk: ${msg(err)}`);
    return { attempted: true, desktop: null, mobile: null, onlineOrderingConfirmed: false, notes };
  } finally {
    await browser?.close().catch(() => {});
  }
}
