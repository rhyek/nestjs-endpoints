import { type Browser, chromium, type Page } from 'playwright';

// The browser a developer keeps open on the web app, without a window.

export type Opened = Awaited<ReturnType<typeof openBrowser>>;

export async function openBrowser(url: string) {
  const browser: Browser = await chromium.launch();
  const page: Page = await browser.newPage();
  // What the page throws and logs as an error, since it was last loaded.
  let errors: string[] = [];
  // How many times the page has loaded: a dev server's full reload is one more.
  let loads = 0;
  page.on('load', () => loads++);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });

  return {
    /** Loads the page afresh, and waits until it has asked the API for all it asks for. */
    async load() {
      errors = [];
      await page.goto(url, { waitUntil: 'networkidle' });
    },
    heading: () => page.locator('h1').first().textContent(),
    /** The text of each item of the list the page renders. */
    items: () => page.locator('li').allTextContents(),
    click: (name: string) => page.getByRole('button', { name }).click(),
    errors: () => errors,
    loads: () => loads,
    close: () => browser.close(),
  };
}
