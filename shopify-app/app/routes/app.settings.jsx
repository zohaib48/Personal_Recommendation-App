import { useState, useCallback, useRef } from "react";
import {
  Banner,
  Button,
  ButtonGroup,
  Card,
  Checkbox,

  FormLayout,
  Layout,
  Page,
  RangeSlider,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { json } from "@remix-run/node";
import { useLoaderData, useLocation } from "@remix-run/react";
import { config } from "../lib/config.server";
import { fetchJson } from "../lib/ml-api.server";



const resolveShopFromRequest = (request) => {
  const url = new URL(request.url);
  return url.searchParams.get("shop") || config.defaultShop;
};

const normaliseErrorMessage = (error) => {
  if (!error?.message) return "Unable to save settings";
  try {
    const parsed = JSON.parse(error.message);
    if (parsed?.error) return parsed.error;
  } catch (_ignored) {
    // not JSON; use plain message
  }
  return error.message;
};

// ------- Loader / Action -------
export const loader = async ({ request }) => {
  try {
    const base = (process.env.ANALYTICS_API_URL || process.env.NODE_API_URL || "http://localhost:3000").replace(/\/$/, "");
    const shop = resolveShopFromRequest(request);
    const data = await fetchJson(`${base}/api/settings?shop=${encodeURIComponent(shop)}`, {}, 3000);
    return json(data || {});
  } catch (err) {
    console.error("Settings loader error:", err);
    return json({ error: normaliseErrorMessage(err) });
  }
};

export const action = async ({ request }) => {
  try {
    const formData = await request.formData();
    const payload = JSON.parse(formData.get("payload") || "{}");
    const base = (process.env.ANALYTICS_API_URL || process.env.NODE_API_URL || "http://localhost:3000").replace(/\/$/, "");
    const shop = resolveShopFromRequest(request);
    const resp = await fetchJson(`${base}/api/settings`, {
      method: "POST",
      body: JSON.stringify({ shop, ...payload }),
    }, 5000);
    return json(resp);
  } catch (err) {
    console.error("Settings action error:", err);
    return json({ error: normaliseErrorMessage(err) });
  }
};

// ------- Component -------
export default function SettingsPage() {
  const initial = useLoaderData() || {};
  const location = useLocation();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [isSaved, setIsSaved] = useState(false);

  // Mode
  const [mode, setMode] = useState(initial.mode || "ai_autopilot");


  // Filters
  const f = initial.filters || {};
  const [priceProxEnabled, setPriceProxEnabled] = useState(f.priceProximity?.enabled ?? true);
  const [priceProxRange, setPriceProxRange] = useState(Math.round((f.priceProximity?.range ?? 0.30) * 100));
  const [tagBoostEnabled, setTagBoostEnabled] = useState(f.tagBoost?.enabled ?? true);
  const [tagBoostWeight, setTagBoostWeight] = useState(Math.round((f.tagBoost?.weight ?? 0.15) * 100));
  const [locationEnabled, setLocationEnabled] = useState(f.locationFilter?.enabled ?? true);
  const [ethicalEnabled, setEthicalEnabled] = useState(f.ethicalFilter?.enabled ?? false);
  const [vegan, setVegan] = useState(f.ethicalFilter?.vegan ?? false);
  const [sustainable, setSustainable] = useState(f.ethicalFilter?.sustainable ?? false);
  const [excludeViewed, setExcludeViewed] = useState(f.excludeViewed ?? false);
  const [excludePurchased, setExcludePurchased] = useState(f.excludePurchased ?? true);
  const [sameCategoryOnly, setSameCategoryOnly] = useState(f.sameCategoryOnly ?? true);

  // Weights — must always sum to 100%
  const w = initial.weights || {};
  const initWeights = (() => {
    const raw = {
      purchase: Math.round((w.purchaseHistory ?? 0.40) * 100),
      cart: Math.round((w.cartItems ?? 0.30) * 100),
      current: Math.round((w.currentProduct ?? 0.20) * 100),
      browse: Math.round((w.browsingHistory ?? 0.10) * 100),
    };
    // Normalise so they sum to 100
    const total = raw.purchase + raw.cart + raw.current + raw.browse;
    if (total === 0) return { purchase: 25, cart: 25, current: 25, browse: 25 };
    const scale = 100 / total;
    const normed = {
      purchase: Math.round(raw.purchase * scale),
      cart: Math.round(raw.cart * scale),
      current: Math.round(raw.current * scale),
      browse: Math.round(raw.browse * scale),
    };
    // Fix rounding drift
    const diff = 100 - (normed.purchase + normed.cart + normed.current + normed.browse);
    normed.purchase += diff;
    return normed;
  })();
  const [wPurchase, setWPurchase] = useState(initWeights.purchase);
  const [wCart, setWCart] = useState(initWeights.cart);
  const [wCurrent, setWCurrent] = useState(initWeights.current);
  const [wBrowse, setWBrowse] = useState(initWeights.browse);
  // Keep a ref of current weights so the drag callback stays stable
  const weightsRef = useRef({ purchase: initWeights.purchase, cart: initWeights.cart, current: initWeights.current, browse: initWeights.browse });

  // Synced setter: updates both state AND ref
  const setWeights = useCallback((vals) => {
    weightsRef.current = vals;
    setWPurchase(vals.purchase);
    setWCart(vals.cart);
    setWCurrent(vals.current);
    setWBrowse(vals.browse);
  }, []);

  /**
   * When one slider changes, redistribute the remaining budget (100 - newVal)
   * proportionally among the other three sliders.
   * Uses weightsRef so the callback identity is stable during drag.
   */
  const handleWeightChange = useCallback((changedKey, newVal) => {
    const clamped = Math.min(100, Math.max(0, newVal));
    const remaining = 100 - clamped;

    const cur = weightsRef.current;
    const keys = ["purchase", "cart", "current", "browse"];
    const others = keys.filter((k) => k !== changedKey);
    const othersTotal = others.reduce((s, k) => s + cur[k], 0);

    let updated;
    if (othersTotal === 0) {
      const each = Math.floor(remaining / others.length);
      updated = {};
      others.forEach((k, i) => {
        updated[k] = i === 0 ? remaining - each * (others.length - 1) : each;
      });
    } else {
      const scale = remaining / othersTotal;
      updated = {};
      let allocated = 0;
      others.forEach((k, i) => {
        if (i === others.length - 1) {
          updated[k] = remaining - allocated;
        } else {
          const v = Math.round(cur[k] * scale);
          updated[k] = v;
          allocated += v;
        }
      });
    }

    // Snap to 5% steps
    const snap = (v) => Math.round(v / 5) * 5;
    const snapped = {};
    others.forEach((k) => { snapped[k] = snap(updated[k]); });
    const snappedTotal = others.reduce((s, k) => s + snapped[k], 0);
    const drift = remaining - snappedTotal;
    if (drift !== 0) {
      const largest = others.reduce((a, b) => (snapped[a] >= snapped[b] ? a : b));
      snapped[largest] += drift;
    }

    const next = {
      purchase: changedKey === "purchase" ? clamped : snapped.purchase,
      cart: changedKey === "cart" ? clamped : snapped.cart,
      current: changedKey === "current" ? clamped : snapped.current,
      browse: changedKey === "browse" ? clamped : snapped.browse,
    };
    setWeights(next);
  }, [setWeights]);



  const isAuto = mode === "ai_autopilot";

  const applyAiDefaults = useCallback(() => {
    setPriceProxEnabled(true); setPriceProxRange(30);
    setTagBoostEnabled(true); setTagBoostWeight(15);
    setLocationEnabled(true);
    setEthicalEnabled(false); setVegan(false); setSustainable(false);
    setExcludeViewed(false); setExcludePurchased(true);
    setSameCategoryOnly(true);
    setWPurchase(40); setWCart(30); setWCurrent(20); setWBrowse(10);
  }, []);

  const handleModeChange = useCallback((val) => {
    setMode(val);
    if (val === "ai_autopilot") applyAiDefaults();
  }, [applyAiDefaults]);

  const handleSave = useCallback(() => {
    const shopFromUrl = new URLSearchParams(location.search).get("shop");
    const shop = shopFromUrl || initial.shop || config.defaultShop;
    const payload = {
      mode,
      filters: {
        priceProximity: { enabled: priceProxEnabled, range: priceProxRange / 100 },
        tagBoost: { enabled: tagBoostEnabled, weight: tagBoostWeight / 100 },
        locationFilter: { enabled: locationEnabled },
        ethicalFilter: { enabled: ethicalEnabled, vegan, sustainable },
        excludeViewed, excludePurchased, sameCategoryOnly,
      },
      weights: {
        purchaseHistory: wPurchase / 100, cartItems: wCart / 100,
        currentProduct: wCurrent / 100, browsingHistory: wBrowse / 100,
      },
    };

    const saveDirect = async () => {
      setIsSaving(true);
      setSaveError(null);
      setIsSaved(false);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const resp = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shop, ...payload }),
          signal: controller.signal,
        });

        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error(data.error || `Save failed (${resp.status})`);
        }

        setIsSaved(true);
      } catch (error) {
        setSaveError(error?.message || "Unable to save settings");
      } finally {
        clearTimeout(timeout);
        setIsSaving(false);
      }
    };

    saveDirect();
  }, [location.search, initial.shop, mode, priceProxEnabled, priceProxRange,
    tagBoostEnabled, tagBoostWeight, locationEnabled, ethicalEnabled,
    vegan, sustainable, excludeViewed, excludePurchased, sameCategoryOnly,
    wPurchase, wCart, wCurrent, wBrowse]);

  return (
    <Page
      title="Settings"
      primaryAction={{
        content: "Save",
        onAction: handleSave,
        loading: isSaving,
      }}
    >
      <Layout>
        {/* ── Mode Toggle ─────────── */}
        <Layout.Section>
          <Card sectioned>
            <FormLayout>
              <Text as="h2" variant="headingMd">
                {"Recommendation Mode"}
              </Text>
              <Select
                label="Mode"
                options={[
                  { label: "AI Autopilot (recommended)", value: "ai_autopilot" },
                  { label: "Manual Control", value: "manual" },
                ]}
                value={mode}
                onChange={handleModeChange}
              />
              {isAuto ? (
                <Text as="p" variant="bodyMd" tone="success">
                  AI Autopilot automatically configures best-practice settings for maximum conversion.
                </Text>
              ) : null}
            </FormLayout>
          </Card>
        </Layout.Section>

        {isSaved ? (
          <Layout.Section>
            <Card sectioned>
              <Text as="p" variant="bodyMd" tone="success">
                {"Settings saved successfully!"}
              </Text>
            </Card>
          </Layout.Section>
        ) : null}
        {saveError ? (
          <Layout.Section>
            <Banner title="Unable to save settings" tone="critical">
              <p>{saveError}</p>
            </Banner>
          </Layout.Section>
        ) : null}

        {/* ── Filters ─────────── */}
        <Layout.Section>
          <Card sectioned>
            <FormLayout>
              <Text as="h2" variant="headingMd">
                {"Recommendation Filters"}
              </Text>
              {isAuto ? (
                <Text as="p" variant="bodyMd" tone="subdued">
                  {"Filters are managed by AI Autopilot. Switch to Manual to customise."}
                </Text>
              ) : null}
              <Checkbox
                label="Price proximity — only recommend within a price range of the viewed product"
                checked={priceProxEnabled}
                onChange={setPriceProxEnabled}
                disabled={isAuto}
              />
              {priceProxEnabled ? (
                <RangeSlider
                  label={"Price range: \u00B1" + priceProxRange + "%"}
                  value={priceProxRange}
                  onChange={setPriceProxRange}
                  min={10}
                  max={50}
                  step={5}
                  output
                  disabled={isAuto}
                />
              ) : null}
              <Checkbox
                label="Tag boost — higher scores for products with matching tags"
                checked={tagBoostEnabled}
                onChange={setTagBoostEnabled}
                disabled={isAuto}
              />
              {tagBoostEnabled ? (
                <RangeSlider
                  label={"Tag boost weight: " + tagBoostWeight + "%"}
                  value={tagBoostWeight}
                  onChange={setTagBoostWeight}
                  min={5}
                  max={40}
                  step={5}
                  output
                  disabled={isAuto}
                />
              ) : null}
              <Checkbox
                label="Same category only"
                checked={sameCategoryOnly}
                onChange={setSameCategoryOnly}
                disabled={isAuto}
              />
              <Checkbox
                label="Location-based filtering"
                checked={locationEnabled}
                onChange={setLocationEnabled}
                disabled={isAuto}
              />
              <Checkbox
                label="Ethical preferences"
                checked={ethicalEnabled}
                onChange={setEthicalEnabled}
                disabled={isAuto}
              />
              {ethicalEnabled ? (
                <FormLayout.Group>
                  <Checkbox label="Vegan / cruelty-free" checked={vegan} onChange={setVegan} disabled={isAuto} />
                  <Checkbox label="Sustainable / eco-friendly" checked={sustainable} onChange={setSustainable} disabled={isAuto} />
                </FormLayout.Group>
              ) : null}
              <Checkbox
                label="Exclude previously purchased products"
                checked={excludePurchased}
                onChange={setExcludePurchased}
                disabled={isAuto}
              />
              <Checkbox
                label="Exclude previously viewed products"
                checked={excludeViewed}
                onChange={setExcludeViewed}
                disabled={isAuto}
              />
            </FormLayout>
          </Card>
        </Layout.Section>

        {/* ── Signal Weights ─────────── */}
        <Layout.Section>
          <Card sectioned>
            <FormLayout>
              <Text as="h2" variant="headingMd">
                {"Signal Weights"}
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                {isAuto
                  ? "Weights are managed by AI Autopilot. Switch to Manual to customise."
                  : `Total: ${wPurchase + wCart + wCurrent + wBrowse}% — adjusting one slider redistributes the rest automatically.`}
              </Text>
              <RangeSlider
                label={"Purchase history: " + wPurchase + "%"}
                value={wPurchase}
                onChange={(val) => handleWeightChange("purchase", val)}
                min={0}
                max={100}
                step={5}
                output
                disabled={isAuto}
              />
              <RangeSlider
                label={"Cart items: " + wCart + "%"}
                value={wCart}
                onChange={(val) => handleWeightChange("cart", val)}
                min={0}
                max={100}
                step={5}
                output
                disabled={isAuto}
              />
              <RangeSlider
                label={"Current product: " + wCurrent + "%"}
                value={wCurrent}
                onChange={(val) => handleWeightChange("current", val)}
                min={0}
                max={100}
                step={5}
                output
                disabled={isAuto}
              />
              <RangeSlider
                label={"Browsing history: " + wBrowse + "%"}
                value={wBrowse}
                onChange={(val) => handleWeightChange("browse", val)}
                min={0}
                max={100}
                step={5}
                output
                disabled={isAuto}
              />
            </FormLayout>
          </Card>
        </Layout.Section>



      </Layout>
    </Page>
  );
}
