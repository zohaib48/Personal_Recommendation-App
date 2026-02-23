import { redirect } from "@remix-run/node";

export const loader = () => redirect("/app");

export default function Index() {
  return null;
}
