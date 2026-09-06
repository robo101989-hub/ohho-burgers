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
          <span>${outlet.opening_time} – ${outlet.closing_time}</span>
          ${outlet.phone ? `<span>${outlet.phone}</span>` : ""}
        </div>
        ${links ? `<div class="location-links">${links}</div>` : ""}
      </article>
    `;
  }).join("");
}

loadLocations();
