// Redirige a home — esta ruta ya no se usa
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return redirect("/app");
};

export default function AdditionalPage() {
  return null;
}
