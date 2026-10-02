import { createRoot } from "react-dom/client";
import Lookbook from "./lookbook.jsx";

function mount() {
  document.querySelectorAll("[data-lookbook-root]").forEach((el) => {
    if (el.dataset.lookbookMounted) return;
    el.dataset.lookbookMounted = "true";

    let config = {};
    try {
      config = JSON.parse(el.getAttribute("data-lookbook-config") || "{}");
    } catch (err) {
      console.error("Lookbook: invalid config JSON", err);
      return;
    }

    createRoot(el).render(<Lookbook {...config} />);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}

// Re-mount any new lookbook sections added live in the theme editor.
if (window.Shopify && Shopify.designMode) {
  document.addEventListener("shopify:section:load", mount);
}