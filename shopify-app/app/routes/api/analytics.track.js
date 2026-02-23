import { json } from "@remix-run/node";
import { trackEvent } from "../../lib/analytics.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const payload = await request.json();
    const result = await trackEvent(payload);
    return json({ success: true, result });
  } catch (error) {
    return json({ success: false, error: error.message }, { status: 500 });
  }
};
