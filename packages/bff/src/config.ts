/**
 * SHOCKME · configuration
 *
 * ONE PLACE. Every runtime switch lives here, is read from the environment
 * once at boot, and is printed in the startup banner. No hidden auto-detect,
 * no silent degradation — if something is off, the banner says so and why.
 */

function flag(name: string, dflt: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return dflt;
  return !['0', 'false', 'no', 'off'].includes(v.toLowerCase());
}

export const CONFIG = {
  port: Number(process.env.PORT ?? 3400),
  nedbUrl: process.env.NEDB_URL ?? 'http://127.0.0.1:7070',
  nedbDb: process.env.NEDB_DB ?? 'shockme',

  /**
   * SHOCKME_IMAGINE — the voice of the room. DEFAULT ON.
   *
   * On:  ambient chat is written by the local imagine model.
   * Off: ambient chat comes from the curated corpus (20 lines, repeats).
   *
   * When ON and the server is unreachable, SHOCKME does NOT die and does NOT
   * pretend everything is fine — it prints a loud banner, falls back to the
   * corpus, and keeps saying so in /health. Zero ambiguity about which mode
   * you are actually in.
   */
  imagine: flag('SHOCKME_IMAGINE', true),

  /**
   * SHOCKME_CHAT — visitors speaking into the room. DEFAULT ON.
   * This is the one switch that turns off anonymous public text instantly,
   * without a deploy. Set 0 and restart if the room is being abused.
   */
  chat: flag('SHOCKME_CHAT', true),
  imagineUrl: process.env.IMAGINE_URL ?? 'http://127.0.0.1:8081',

  worldSeed: process.env.SHOCKME_WORLD_SEED ?? 'the-room-remembers',

  /**
   * Public origin. OG tags and share links MUST be absolute — a relative
   * og:image does not unfurl on any platform, so this cannot be inferred
   * from the request host without breaking behind Cloudflare.
   */
  origin: (process.env.SHOCKME_ORIGIN ?? 'http://127.0.0.1:3400').replace(/\/+$/, ''),
} as const;

export type ImagineStatus = 'on' | 'off-by-flag' | 'unreachable';

const C = '\x1b[36m', G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m', D = '\x1b[2m', X = '\x1b[0m';

export function banner(imagine: ImagineStatus, extra: string[] = []): void {
  const rows: [string, string][] = [
    ['site', `${C}http://127.0.0.1:${CONFIG.port}${X}`],
    ['engine', `${CONFIG.nedbUrl}  ${D}db=${CONFIG.nedbDb}${X}`],
    ['origin', `${D}${CONFIG.origin}${X}`],
  ];

  rows.push(['voices', CONFIG.chat ? `${G}open${X} ${D}visitors can speak${X}` : `${D}closed (SHOCKME_CHAT=0)${X}`]);

  if (imagine === 'on') {
    rows.push(['voice', `${G}imagine${X}  ${D}${CONFIG.imagineUrl}${X}`]);
  } else if (imagine === 'off-by-flag') {
    rows.push(['voice', `${D}curated corpus${X}  ${D}(SHOCKME_IMAGINE=0)${X}`]);
  } else {
    rows.push(['voice', `${Y}curated corpus — imagine UNREACHABLE${X}`]);
  }

  console.log(`\n  ${C}SHOCKME${X} ${D}· the waiting room${X}\n`);
  for (const [k, v] of rows) console.log(`  ${D}${k.padEnd(7)}${X}${v}`);
  for (const e of extra) console.log(`  ${e}`);

  if (imagine === 'unreachable') {
    console.log(`\n  ${Y}┌────────────────────────────────────────────────────────────┐${X}`);
    console.log(`  ${Y}│${X} SHOCKME_IMAGINE is ON but nothing is listening at          ${Y}│${X}`);
    console.log(`  ${Y}│${X} ${CONFIG.imagineUrl.padEnd(58)}${Y}│${X}`);
    console.log(`  ${Y}│${X}                                                            ${Y}│${X}`);
    console.log(`  ${Y}│${X} The room still works — it just uses the 20-line corpus     ${Y}│${X}`);
    console.log(`  ${Y}│${X} and will repeat itself.                                    ${Y}│${X}`);
    console.log(`  ${Y}│${X}                                                            ${Y}│${X}`);
    console.log(`  ${Y}│${X} Start it:  ${G}./run/imagine.sh${X}                                ${Y}│${X}`);
    console.log(`  ${Y}│${X} Silence:   ${D}SHOCKME_IMAGINE=0 ./run/bff.sh${X}                   ${Y}│${X}`);
    console.log(`  ${Y}└────────────────────────────────────────────────────────────┘${X}`);
  }
  console.log();
}
