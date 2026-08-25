import { permanentRedirect } from "next/navigation";

/** /admin/embed was removed; distribution lives on the agent page (PR-C). */
export default function EmbedRedirect() {
  permanentRedirect("/admin/funds");
}
