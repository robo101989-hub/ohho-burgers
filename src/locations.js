import { supabase } from "./supabase.js";

const grid = document.getElementById("locationGrid");

function safeUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("\x27", "&#039;");
}

async function loadLocations() {
  if (!grid) return;

  const { data, error } = await supabase
    .from("outlets")
    .select("id,name,slug,address,phone,opening_time,closing_time,maps_url,zomato_url,swiggy_url,website_enabled")
    .eq("website_enabled", true)
    .order("created_at", { ascending: true });

  if (error) {
    grid.innerHTML = '<p class="location-error">Unable to load outlets right now.</p>';
    console.error("OHHO locations error:", error);
    return;
  }

  if (!data?.length) {
    grid.innerHTML = '<p class="location-error">No outlets are currently available on the website.</p>';
    return;
  }

  grid.innerHTML = data.map((outlet, index) => {
    const formatTime = (value) => {
      if (!value) return "";
      const [hour, minute] = value.split(":").map(Number);
      const suffix = hour >= 12 ? "PM" : "AM";
      const displayHour = hour % 12 || 12;
      return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
    };

    const openingTime = formatTime(outlet.opening_time);
    const closingTime = formatTime(outlet.closing_time);
    const name = escapeHtml(outlet.name);
    const address = escapeHtml(outlet.address);
    const phone = escapeHtml(outlet.phone);
    const mapsUrl = escapeHtml(safeUrl(outlet.maps_url) || "");
    const zomatoUrl = escapeHtml(safeUrl(outlet.zomato_url) || "");
    const swiggyUrl = escapeHtml(safeUrl(outlet.swiggy_url) || "");
    const phoneDigits = String(outlet.phone || "").replace(/\D/g, "");
    const whatsappPhone = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits;
    const whatsappUrl = whatsappPhone.length >= 10
      ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(`Hi OHHO Burgers, I would like to place a takeaway order from the ${outlet.name} outlet.`)}`
      : "";

    const links = [
      mapsUrl ? `<a href="${mapsUrl}" target="_blank" rel="noopener">Maps ↗</a>` : "",
      zomatoUrl ? `<a href="${zomatoUrl}" target="_blank" rel="noopener">Zomato ↗</a>` : "",
      swiggyUrl ? `<a href="${swiggyUrl}" target="_blank" rel="noopener">Swiggy ↗</a>` : ""
    ].filter(Boolean).join("");

    return `
      <article class="location-card location-card-premium shared-outlet-card">
        <div class="location-visual">
          <img src="/images/ohho-food-cart.jpeg" alt="OHHO Burgers food cart at ${name}" loading="lazy">
          <span class="location-number">${String(index + 1).padStart(2, "0")}</span>
          <span class="location-open">NOW SERVING</span>
        </div>
        <div class="location-content">
          <p class="location-kicker">OHHO BURGERS · OUTLET</p>
          <h3>${name}</h3>
          <p class="location-address">⌖ ${address}</p>
          <div class="location-meta">
            <span>◷ ${openingTime} – ${closingTime}</span>
            ${outlet.phone ? `<span>☎ ${phone}</span>` : ""}
          </div>
          <div class="location-links">
            ${whatsappUrl ? `<a class="location-order" href="${whatsappUrl}" target="_blank" rel="noopener">ORDER ON WHATSAPP <b>↗</b></a>` : ""}
            ${links ? `<div class="location-secondary">${links}</div>` : ""}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

loadLocations();
