import { drawWheel, animateWheel, rewardMessage } from './src/spin-wheel.js';
import { wheelSlots } from './lib/spin-rewards.js';
const $ = selector => document.querySelector(selector);
const outlet = new URLSearchParams(location.search).get('outlet');
let spinning = false;
function deviceKey() { let key = localStorage.getItem('ohho_spin_device'); if (!key) { key = crypto.randomUUID(); localStorage.setItem('ohho_spin_device', key); } return key; }
async function init() {
  if (!outlet) { $('#spinMessage').textContent = 'Please scan the QR displayed at your OHHO cart.'; return; }
  try {
    const res = await fetch(`/api/spin?outlet=${encodeURIComponent(outlet)}`, { cache:'no-store' });
    const data = await res.json(); if (!res.ok) throw new Error(data.error);
    $('#outletName').textContent = `Your outlet · ${data.outlet.name}`;
    drawWheel($('#wheel'), data.slots || wheelSlots(data.prizes));
    $('#spinButton').disabled = !data.enabled;
    $('#spinMessage').textContent = data.enabled ? `One spin today. Rewards valid on orders ₹${data.minimumOrder}+; free gifts are excluded from this minimum.` : 'Spin & Win is paused at this cart.';
  } catch (error) { $('#spinMessage').textContent = error.message || 'This QR is not active.'; }
}
$('#spinButton').addEventListener('click', async () => {
  if (spinning || !outlet) return;
  spinning = true;
  const button = $('#spinButton'); button.disabled = true;
  $('#rewardCard').classList.add('hidden');
  $('#spinMessage').textContent = 'Finding your OHHO reward…';
  try {
    const res = await fetch('/api/spin', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({action:'spin',outlet,deviceKey:deviceKey()}) });
    const data = await res.json();
    if (!res.ok && !data.outcome) throw new Error(data.error);
    await animateWheel($('#wheel'), data);
    $('#spinMessage').textContent = rewardMessage(data);
    button.textContent = 'Today’s spin used';
    if (data.outcome !== 'NO_REWARD') {
      $('#rewardLabel').textContent = data.reward.label;
      $('#rewardCode').textContent = data.reward.code;
      $('#rewardCard').classList.remove('hidden');
    }
  } catch (error) { $('#spinMessage').textContent = error.message || 'Could not spin. Please try again.'; button.disabled = false; }
  finally { spinning = false; }
});
init();
