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
    .select("id,name,slug,address,phone,opening_time,closing_time,maps_url,zomato_url,swiggy_url,status")
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true });

  if (error) {
    grid.innerHTML = '<p class="location-error">Unable to load outlets right now.</p>';
    console.error("OHHO locations error:", error);
    return;
  }

  if (!data?.length) {
    grid.innerHTML = '<p class="location-error">No active outlets available.</p>';
    return;
  }

  grid.innerHTML = data.map(outlet => {
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

    const links = [
      mapsUrl ? `<a href="${mapsUrl}" target="_blank" rel="noopener">Maps ↗</a>` : "",
      zomatoUrl ? `<a href="${zomatoUrl}" target="_blank" rel="noopener">Zomato ↗</a>` : "",
      swiggyUrl ? `<a href="${swiggyUrl}" target="_blank" rel="noopener">Swiggy ↗</a>` : ""
    ].filter(Boolean).join("");

    return `
      <article class="location-card">
        <div class="location-card-top">
          <span class="location-status">OPEN OUTLET</span>
          <span class="location-arrow">↗</span>
        </div>
        <h2>${name}</h2>
        <p class="location-address">${address}</p>
        <div class="location-meta">
          <span>${openingTime} – ${closingTime}</span>
          ${outlet.phone ? `<span>☎ ${phone}</span>` : ""}
        </div>
        ${links ? `<div class="location-links">${links}</div>` : ""}
      </article>
    `;
  }).join("");
}

loadLocations();
