import { json } from "@remix-run/node";
import { getPopular, getRecommendations } from "../../lib/ml-api.server";

const parseQuery = (request) => {
  const url = new URL(request.url);
  return {
    merchantId: url.searchParams.get("merchantId") || url.searchParams.get("shop"),
    productId: url.searchParams.get("productId"),
    customerId: url.searchParams.get("customerId"),
    location: url.searchParams.get("location"),
    k: Number.parseInt(url.searchParams.get("k") || "6", 10),
  };
};

export const loader = async ({ request }) => {
  const params = parseQuery(request);
  if (!params.merchantId || !params.productId) {
    return json({ error: "Missing merchantId or productId" }, { status: 400 });
  }

  try {
    const data = await getRecommendations(params);
    if (!data || !data.recommendations || data.recommendations.length === 0) {
      return json(await getPopular({ merchantId: params.merchantId, k: params.k }));
    }
    return json(data);
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const payload = await request.json();
    if (!payload.merchantId || !payload.productId) {
      return json({ error: "Missing merchantId or productId" }, { status: 400 });
    }
    const data = await getRecommendations(payload);
    if (!data || !data.recommendations || data.recommendations.length === 0) {
      return json(await getPopular({ merchantId: payload.merchantId, k: payload.k || 6 }));
    }
    return json(data);
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  }
};
