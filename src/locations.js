import { supabase } from "./supabase.js";

const grid = document.getElementById("locationGrid");

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

    const links = [
      outlet.maps_url ? `<a href="${outlet.maps_url}" target="_blank" rel="noopener">Maps ↗</a>` : "",
      outlet.zomato_url ? `<a href="${outlet.zomato_url}" target="_blank" rel="noopener">Zomato ↗</a>` : "",
      outlet.swiggy_url ? `<a href="${outlet.swiggy_url}" target="_blank" rel="noopener">Swiggy ↗</a>` : ""
    ].filter(Boolean).join("");

    return `
      <article class="location-card">
        <div class="location-card-top">
          <span class="location-status">OPEN OUTLET</span>
          <span class="location-arrow">↗</span>
        </div>
        <h2>${outlet.name}</h2>
        <p class="location-address">${outlet.address}</p>
        <div class="location-meta">
          <span>${openingTime} – ${closingTime}</span>
          ${outlet.phone ? `<span>☎ ${outlet.phone}</span>` : ""}
        </div>
        ${links ? `<div class="location-links">${links}</div>` : ""}
      </article>
    `;
  }).join("");
}

loadLocations();
