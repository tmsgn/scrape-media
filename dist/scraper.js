import { launchBrowser } from "./utils/puppeteer.js";
function isM3U8(url) {
    return /\.m3u8(\?|$)/i.test(url);
}
function isSubtitle(url) {
    return /\.(vtt|srt)(\?|$)/i.test(url);
}
function isHeavyResource(type) {
    return ["image", "stylesheet", "font", "media"].includes(type);
}
const delay = (ms) => new Promise((res) => setTimeout(res, ms));
function attachNetworkCollectors(page, m3u8, subs) {
    page.on("request", (req) => {
        const url = req.url();
        if (isM3U8(url))
            m3u8.add(url);
        if (isSubtitle(url))
            subs.add(url);
        if (isHeavyResource(req.resourceType()))
            return req.abort().catch(() => { });
        return req.continue().catch(() => { });
    });
    page.on("response", async (res) => {
        try {
            const url = res.url();
            if (isM3U8(url))
                m3u8.add(url);
            if (isSubtitle(url))
                subs.add(url);
            const req = res.request();
            const reqUrl = req.url();
            if (isM3U8(reqUrl))
                m3u8.add(reqUrl);
            if (isSubtitle(reqUrl))
                subs.add(reqUrl);
        }
        catch { }
    });
}
async function createPage(browser) {
    // Retry opening a page in case the browser is still warming up in serverless
    let page = null;
    let lastErr;
    for (let i = 0; i < 3; i++) {
        try {
            page = await browser.newPage();
            break;
        }
        catch (e) {
            lastErr = e;
            await delay(250);
        }
    }
    if (!page)
        throw lastErr || new Error("Failed to open page");
    // Set UA (skip viewport emulation to avoid Emulation.setTouchEmulationEnabled in serverless)
    for (let i = 0; i < 2; i++) {
        try {
            await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
            break;
        }
        catch (e) {
            if (i === 1)
                throw e;
            try {
                await page.close();
            }
            catch { }
            page = await browser.newPage();
        }
    }
    await page.setDefaultNavigationTimeout(30000);
    await page.setDefaultTimeout(30000);
    await page.setRequestInterception(true);
    return page;
}
async function tryClickSelectors(frame, selectors) {
    for (const sel of selectors) {
        const el = await frame.$(sel).catch(() => null);
        if (!el)
            continue;
        try {
            await el.click({ delay: 50 });
            return true;
        }
        catch { }
    }
    return false;
}
async function tryCloseOverlays(frame) {
    const closeSelectors = [
        "[class*=close]",
        ".vjs-modal-dialog-close-button",
        ".jw-icon-close",
        ".x-close,.btn-close",
        "[aria-label*=Close i]",
    ];
    await tryClickSelectors(frame, closeSelectors);
}
async function tryAutoplay(frame) {
    try {
        await frame.evaluate(() => {
            const vids = Array.from(document.querySelectorAll("video"));
            for (const v of vids) {
                try {
                    v.muted = true;
                    v.playsInline = true;
                    v.play().catch(() => { });
                }
                catch { }
            }
        });
    }
    catch { }
}
async function tryPlay(frame) {
    const playSelectors = [
        "button[aria-label*=Play i]",
        ".vjs-big-play-button",
        "button.jw-icon.jw-icon-display",
        "button[title*=Play i]",
        "[class*=play]",
        "button, .btn, [role=button]",
    ];
    await tryClickSelectors(frame, playSelectors);
    await tryAutoplay(frame);
}
async function tryInteractAllFrames(page) {
    const frames = page.frames();
    for (const f of frames) {
        await tryCloseOverlays(f);
        await tryPlay(f);
    }
}
export async function scrapeProvider(targetUrl) {
    // returns discovered m3u8 urls and subtitle urls
    let browser = null;
    const m3u8Urls = new Set();
    const subUrls = new Set();
    const PASSIVE_WAIT_MS = 6000;
    const CLICK_WAIT_MS = 8000;
    const launchArgs = [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--autoplay-policy=no-user-gesture-required",
        "--mute-audio",
        "--ignore-certificate-errors",
        "--allow-running-insecure-content",
    ];
    try {
        browser = await launchBrowser({ args: launchArgs });
        const page = await createPage(browser);
        attachNetworkCollectors(page, m3u8Urls, subUrls);
        // Retry navigation once to avoid transient 'session closed' during cold start
        for (let i = 0; i < 2; i++) {
            try {
                await page.goto(targetUrl, {
                    waitUntil: "domcontentloaded",
                    timeout: 30000,
                });
                break;
            }
            catch (e) {
                if (i === 1)
                    throw e;
                await delay(300);
            }
        }
        await delay(PASSIVE_WAIT_MS);
        if (m3u8Urls.size > 0)
            return Array.from(m3u8Urls);
        await tryInteractAllFrames(page);
        await delay(CLICK_WAIT_MS);
        if (m3u8Urls.size > 0)
            return Array.from(m3u8Urls);
        await tryInteractAllFrames(page);
        const start = Date.now();
        while (Date.now() - start < 5000) {
            if (m3u8Urls.size > 0)
                break;
            await delay(250);
        }
        return Array.from(m3u8Urls);
    }
    finally {
        try {
            await browser?.close();
        }
        catch { }
    }
}
export async function scrapeProviderWithSubtitles(targetUrl) {
    let browser = null;
    const m3u8Urls = new Set();
    const subUrls = new Set();
    const PASSIVE_WAIT_MS = 6000;
    const CLICK_WAIT_MS = 8000;
    const launchArgs = [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--autoplay-policy=no-user-gesture-required",
        "--mute-audio",
        "--ignore-certificate-errors",
        "--allow-running-insecure-content",
    ];
    try {
        browser = await launchBrowser({ args: launchArgs });
        const page = await createPage(browser);
        attachNetworkCollectors(page, m3u8Urls, subUrls);
        for (let i = 0; i < 2; i++) {
            try {
                await page.goto(targetUrl, {
                    waitUntil: "domcontentloaded",
                    timeout: 30000,
                });
                break;
            }
            catch (e) {
                if (i === 1)
                    throw e;
                await delay(300);
            }
        }
        await delay(PASSIVE_WAIT_MS);
        // Attempt to extract subtitles from common players in DOM as a fallback
        const domSubs = await page.evaluate(() => {
            const found = [];
            const urls = new Set();
            // <track src="..." kind="subtitles" label="..." srclang="...">
            document.querySelectorAll("track[kind='subtitles'][src]").forEach((t) => {
                const track = t;
                const u = track.src;
                if (u && !urls.has(u)) {
                    urls.add(u);
                    const label = (track.label || track.getAttribute("label") || "").trim() ||
                        undefined;
                    const lang = (track.srclang || track.getAttribute("srclang") || "").trim() ||
                        undefined;
                    found.push({ url: u, label, lang });
                }
            });
            // data-track or data-subtitle attributes seen on some sites
            document
                .querySelectorAll("[data-track],[data-subtitle]")
                .forEach((el) => {
                const u = (el.getAttribute("data-track") ||
                    el.getAttribute("data-subtitle") ||
                    "").trim();
                if (u && !urls.has(u)) {
                    urls.add(u);
                    const label = (el.getAttribute("data-label") ||
                        el.getAttribute("label") ||
                        "").trim() || undefined;
                    const lang = (el.getAttribute("data-lang") ||
                        el.getAttribute("lang") ||
                        "").trim() || undefined;
                    found.push({ url: u, label, lang });
                }
            });
            return found;
        });
        domSubs.forEach(({ url }) => subUrls.add(url));
        if (m3u8Urls.size === 0) {
            await tryInteractAllFrames(page);
            await delay(CLICK_WAIT_MS);
        }
        if (m3u8Urls.size === 0) {
            await tryInteractAllFrames(page);
            const start = Date.now();
            while (Date.now() - start < 5000) {
                if (m3u8Urls.size > 0)
                    break;
                await delay(250);
            }
        }
        // Helper: infer ISO 639-1 code from various hints
        const toIso = (s) => {
            if (!s)
                return undefined;
            const v = s.toLowerCase();
            // common aliases mapping
            const map = {
                eng: "en",
                english: "en",
                en_us: "en",
                en_gb: "en",
                us: "en",
                uk: "en",
                spa: "es",
                spanish: "es",
                esp: "es",
                por: "pt",
                portuguese: "pt",
                br: "pt",
                pt_br: "pt",
                fre: "fr",
                fra: "fr",
                french: "fr",
                ger: "de",
                deu: "de",
                german: "de",
                ita: "it",
                italian: "it",
                ind: "id",
                ina: "id",
                bahasa: "id",
                tur: "tr",
                turkish: "tr",
                ara: "ar",
                arabic: "ar",
                hin: "hi",
                hindi: "hi",
                rus: "ru",
                russian: "ru",
                zho: "zh",
                chi: "zh",
                chinese: "zh",
                zh_cn: "zh",
                zh_tw: "zh",
                kor: "ko",
                korean: "ko",
                jpn: "ja",
                japanese: "ja",
                vie: "vi",
                vietnamese: "vi",
                pol: "pl",
                polish: "pl",
                dut: "nl",
                nld: "nl",
                dutch: "nl",
                swe: "sv",
                swedish: "sv",
                nor: "no",
                nob: "no",
                nyn: "no",
                norwegian: "no",
                fin: "fi",
                finnish: "fi",
                dan: "da",
                danish: "da",
                hun: "hu",
                hungarian: "hu",
                tha: "th",
                thai: "th",
                // added common full names from sample
                albanian: "sq",
                bulgarian: "bg",
                romanian: "ro",
                greek: "el",
                czech: "cs",
                slovak: "sk",
                serbian: "sr",
                croatian: "hr",
                hebrew: "he",
                ukrainian: "uk",
                urdu: "ur",
                persian: "fa",
                farsi: "fa",
                tamil: "ta",
                telugu: "te",
                malayalam: "ml",
                malay: "ms",
                swahili: "sw",
                amharic: "am",
            };
            if (map[v])
                return map[v];
            // normalize separators
            const cleaned = v.replace(/[^a-z]/g, "");
            if (map[cleaned])
                return map[cleaned];
            // if already 2-letter
            if (/^[a-z]{2}$/.test(cleaned))
                return cleaned;
            return undefined;
        };
        // Index DOM metadata for labels/langs
        const domMeta = new Map();
        domSubs.forEach((d) => domMeta.set(d.url, { label: d.label, lang: d.lang }));
        const inferFromUrl = (u) => {
            const lower = u.toLowerCase();
            // try short codes or 3-letter aliases first
            const m = lower.match(/(?:[\._\-\/]|")(en|es|pt|fr|de|it|id|tr|ar|ru|zh|ko|ja|vi|pl|nl|sv|no|fi|da|hu|th|eng|spa|por|fre|fra|ger|deu|ita|ind|tur|ara|rus|zho|chi|jpn|vie|pol|dut|nld|swe|nor|fin|dan|hun|tha)(?=[\._\-\/"]|\.|$)/);
            const byToken = toIso(m?.[1]);
            if (byToken)
                return byToken;
            // extract filename without extension and split on separators/spaces
            const file = lower
                .substring(lower.lastIndexOf("/") + 1)
                .replace(/\.[a-z0-9]+$/, "");
            const parts = file.split(/[^a-z]+/).filter(Boolean);
            const candidates = [];
            for (const p of parts) {
                const code = toIso(p);
                if (code) {
                    // deprioritize 'hi' when coexisting with other candidates (HI often means hearing-impaired)
                    const weight = code === "hi" ? 0.5 : 1;
                    candidates.push({ code, weight });
                }
            }
            if (candidates.length === 0)
                return undefined;
            // prefer highest weight and first occurrence
            candidates.sort((a, b) => b.weight - a.weight);
            return candidates[0].code;
        };
        const subtitles = Array.from(subUrls).map((u) => {
            const meta = domMeta.get(u);
            let label = meta?.label;
            if (!label) {
                try {
                    const file = u.substring(u.lastIndexOf("/") + 1);
                    const noExt = file.replace(/\.[a-z0-9]+$/i, "");
                    const pretty = decodeURIComponent(noExt)
                        .replace(/[\._\-]+/g, " ")
                        .trim();
                    if (pretty)
                        label = pretty;
                }
                catch { }
            }
            const byLangAttr = toIso(meta?.lang);
            const byLabel = toIso(label);
            const byUrl = inferFromUrl(u);
            const langCode = byLangAttr || byLabel || byUrl;
            return { url: u, label, lang: meta?.lang, langCode };
        });
        return { urls: Array.from(m3u8Urls), subtitles };
    }
    finally {
        try {
            await browser?.close();
        }
        catch { }
    }
}
