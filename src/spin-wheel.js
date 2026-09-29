import { wheelRotation } from '../lib/spin-rewards.js';
import './spin-wheel.css';
const ns = 'http://www.w3.org/2000/svg';
function svgNode(tag, attrs, text) {
  const node = document.createElementNS(ns, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  if (text) node.textContent = text;
  return node;
}
export function drawWheel(target, slots) {
  const svg = svgNode('svg', { viewBox: '0 0 360 360', role: 'img', 'aria-label': slots.map(item => item.label).join(', ') });
  slots.forEach((prize, index) => {
    const start = (index * 60 - 120) * Math.PI / 180;
    const end = start + Math.PI / 3;
    const x1 = 180 + 170 * Math.cos(start), y1 = 180 + 170 * Math.sin(start);
    const x2 = 180 + 170 * Math.cos(end), y2 = 180 + 170 * Math.sin(end);
    const none = prize.type === 'NONE';
    svg.append(svgNode('path', { d: `M180 180 L${x1} ${y1} A170 170 0 0 1 ${x2} ${y2} Z`, fill: none ? '#242c23' : index % 2 ? '#ffbb38' : '#ffe251', stroke: '#10150e', 'stroke-width': 2 }));
    const group = svgNode('g', { transform: `rotate(${index * 60} 180 180)` });
    const words = (none ? 'Better luck next time' : prize.label).split(/\s+/);
    const lines = [''];
    words.forEach(word => { if ((lines.at(-1) + ' ' + word).trim().length > 13 && lines.at(-1)) lines.push(word); else lines[lines.length - 1] = (lines.at(-1) + ' ' + word).trim(); });
    if (lines.length > 3) { lines.length = 3; lines[2] = lines[2].slice(0, 10) + '…'; }
    const size = lines.some(line => line.length > 13) ? 12 : 16;
    lines.forEach((line, row) => group.append(svgNode('text', { x: 180, y: 64 + row * 17, 'text-anchor': 'middle', fill: none ? '#bec9af' : '#19200f', 'font-size': size, 'font-weight': 700, 'font-family': 'Arial, sans-serif' }, line)));
    svg.append(group);
  });
  svg.append(svgNode('circle', { cx:180, cy:180, r:47, fill:'#10180f', stroke:'#fff1a0', 'stroke-width':3 }));
  svg.append(svgNode('text', { x:180, y:181, fill:'#ffe251', 'text-anchor':'middle', 'font-size':20, 'font-weight':800, 'font-family':'Arial, sans-serif' }, 'OHHO'));
  svg.append(svgNode('text', { x:180, y:198, fill:'#f6f5e9', 'text-anchor':'middle', 'font-size':8, 'letter-spacing':2 }, 'GOOD LUCK'));
  target.replaceChildren(svg);
  target.classList.add('reward-wheel');
}
export async function animateWheel(target, data) {
  if (data.reused) return; // A previous code is not a new spin.
  if (!data.slots || !Number.isInteger(data.segment)) throw new Error('Could not confirm the wheel result. Please retry to recover your code.');
  drawWheel(target, data.slots);
  const rotation = wheelRotation(data.segment, Number(target.dataset.rotation || 0));
  target.dataset.rotation = rotation;
  target.style.transform = `rotate(${rotation}deg)`;
  await new Promise(resolve => setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 50 : 3200));
}
export function rewardMessage(data) {
  if (data.outcome === 'NO_REWARD') return data.reused ? 'Today’s spin had no prize. Try again tomorrow.' : 'Better luck next time! Come back tomorrow for another spin.';
  if (data.reward.status === 'REDEEMED') return 'This reward has already been redeemed.';
  if (new Date(data.reward.expiresAt).getTime() < Date.now()) return 'This reward has expired. Come back tomorrow for another spin.';
  return data.reused ? 'You already spun today. Here is your original reward code.' : 'You won! Show this code to the team before payment.';
}
