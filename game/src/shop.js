// The shop: the screen between runs where shards buy the next descent a better chance.
//
// The purchases are rules, so they are not made here: `core.js`'s `buy()` asks the Rust core what
// each level costs and hands it the shards, and `save.js` files the result. This file is the
// screen, the keyboard, and the words — the part that is presentation.

import { VIEW } from './config.js';

/** What each upgrade does, in the shop's own voice. Kept beside the screen that shows it. */
export const SHOP_COPY = {
  Lantern: 'The tank holds more light from the first metre.',
  Thrift: 'The glow drains a little slower, everywhere.',
  Harvest: 'Every mote and star feeds more than it did.',
  Charm: 'Start each run with a shield already up.',
  'Head Start': 'Begin further down the corridor.',
  Reach: 'The comet takes light from further away.',
  Greed: 'Everything taken is worth a little more.',
};

const ROW_H = 46;
const TOP = 118;

/**
 * The shop screen. It is a thin controller over three things it does not own: the core's prices
 * (`shop()`), the player's shards (`save`), and the renderer's canvas. It draws itself because
 * nothing else does: the shop is the one screen with a list in it.
 */
export function createShop(canvas) {
  const ctx = canvas.getContext('2d');
  let entries = [];
  let cursor = 0;
  let save = null;
  let readShop = null;
  let buy = null;
  let notice = '';
  let noticeTimer = 0;

  /** Opens the screen on a save and a live catalogue. */
  function open({ catalogue, saveRef, purchase }) {
    entries = catalogue();
    save = saveRef;
    readShop = catalogue;
    buy = purchase;
    cursor = Math.min(cursor, Math.max(0, entries.length - 1));
    notice = '';
    noticeTimer = 0;
  }

  function move(delta) {
    if (entries.length === 0) return;
    cursor = (cursor + delta + entries.length) % entries.length;
  }

  /** Buys the row under the cursor, and says what happened. */
  function confirm() {
    const entry = entries[cursor];
    if (!entry || !buy) return { bought: false, reason: 'nothing to buy' };
    if (entry.level >= entry.max) {
      notice = 'ALREADY FULL';
      noticeTimer = 1.6;
      return { bought: false, reason: 'full' };
    }
    if (save.save.shards < entry.cost) {
      notice = `NEED ${entry.cost - save.save.shards} MORE SHARDS`;
      noticeTimer = 1.6;
      return { bought: false, reason: 'poor' };
    }
    const charged = buy(entry.index, save.save.shards);
    if (!charged) {
      notice = 'NOT BOUGHT';
      noticeTimer = 1.6;
      return { bought: false, reason: 'refused' };
    }
    save.bought(entry.index, charged);
    entries = readShop();
    notice = `BOUGHT ${entry.name.toUpperCase()}`;
    noticeTimer = 1.8;
    return { bought: true, charged, entry };
  }

  function tick(dt) {
    if (noticeTimer > 0) noticeTimer = Math.max(0, noticeTimer - dt);
  }

  /** Draws the shop. Called by the renderer's frame while the screen is up. */
  function draw(palette, ink, inkDim, inkFaint, panel, alphaFn) {
    const pad = 26;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = ink;
    ctx.font = "800 26px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.letterSpacing = '6px';
    ctx.fillText('SUPPLY', pad, 62);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = inkDim;
    ctx.font = "600 11px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.letterSpacing = '2.4px';
    ctx.fillText('SPEND SHARDS ON THE NEXT FALL', pad, 82);
    ctx.letterSpacing = '0px';

    // The purse, top right, where the score goes in play.
    ctx.textAlign = 'right';
    ctx.fillStyle = palette.mote;
    ctx.font = "700 22px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.fillText(`${save.save.shards}`, VIEW.width - pad, 62);
    ctx.fillStyle = inkDim;
    ctx.font = "600 10px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.letterSpacing = '2.2px';
    ctx.fillText('SHARDS', VIEW.width - pad, 80);
    ctx.letterSpacing = '0px';

    // The list: one row per upgrade, priced, with its level and what it does.
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const y = TOP + index * ROW_H;
      const active = index === cursor;
      const full = entry.level >= entry.max;
      const affordable = !full && save.save.shards >= entry.cost;
      panel(pad, y, VIEW.width - pad * 2, ROW_H - 8, 10,
        active ? alphaFn('#ffffff', 0.09) : alphaFn('#000000', 0.28),
        active ? alphaFn(palette.accent, 0.8) : alphaFn('#ffffff', 0.10));

      ctx.textAlign = 'left';
      ctx.fillStyle = full ? inkFaint : ink;
      ctx.font = "700 15px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
      ctx.fillText(entry.name.toUpperCase(), pad + 14, y + 20);
      ctx.fillStyle = inkFaint;
      ctx.font = "600 10px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
      ctx.fillText(SHOP_COPY[entry.name] ?? entry.blurb, pad + 14, y + 33);

      // The level, as pips: a filled pip per level held, an outline per level available.
      for (let pip = 0; pip < entry.max; pip += 1) {
        const px = VIEW.width - pad - 190 - (entry.max - pip) * 12;
        const py = y + 15;
        ctx.beginPath();
        ctx.arc(px, py, 3.4, 0, Math.PI * 2);
        if (pip < entry.level) {
          ctx.fillStyle = palette.accent;
          ctx.fill();
        } else {
          ctx.strokeStyle = alphaFn('#ffffff', 0.24);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      ctx.textAlign = 'right';
      ctx.fillStyle = full ? inkFaint : affordable ? palette.mote : alphaFn('#ff9d7a', 0.92);
      ctx.font = "700 13px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
      ctx.fillText(full ? 'FULL' : `${entry.cost} ◇`, VIEW.width - pad - 16, y + 22);
    }

    // The notice, and the keys that leave.
    if (noticeTimer > 0 && notice) {
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.min(1, noticeTimer / 0.4);
      ctx.fillStyle = palette.accent;
      ctx.font = "700 12px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
      ctx.letterSpacing = '3px';
      ctx.fillText(notice, VIEW.width / 2, VIEW.height - 62);
      ctx.letterSpacing = '0px';
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = inkFaint;
    ctx.font = "600 10px 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
    ctx.letterSpacing = '2px';
    ctx.fillText('↑ ↓ CHOOSE   ·   ENTER BUY   ·   ESC BACK', VIEW.width / 2, VIEW.height - 34);
    ctx.letterSpacing = '0px';
  }

  return { open, move, confirm, draw, tick, get cursor() { return cursor; }, get entries() { return entries; } };
}
