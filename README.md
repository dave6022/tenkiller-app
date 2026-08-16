# Tenkiller Map

Interactive terrain, elevation and parcel map of Lake Tenkiller, Oklahoma.

## Parcels & owners

Source: **Oklahoma OGI's `ogi_wms:Statewide_Parcels`**, compiled from every
County Assessor's tax roll and served from `okmaps.org/geoserver`.

Two paths, because they have different constraints:

- **Boundaries** are WMS raster tiles requested straight from GeoServer.
  Images are not CORS-restricted, so no proxy is needed.
- **Tapping a parcel** needs `GetFeatureInfo`, and GeoServer sends **no
  `Access-Control-Allow-Origin` header**, so a browser fetch is blocked. That
  goes through `/api/parcel` — a Netlify function in production, and an
  equivalent Vite middleware in dev, so app code never knows the difference.

> **Deploying this needs a git-connected build, not drag-and-drop.** Netlify
> Drop uploads only the published folder, so functions are not included and
> `/api/parcel` will 404. Boundaries would still draw; taps would fail.

Returned per parcel: owner of record, county, parcel ID, account number,
acreage, building counts, school district, township-range-section, and a link
to the county's own record. Open water and Corps shoreline are often outside
the tax roll and correctly return nothing.

**Not built, deliberately: search by owner name.** Tapping a place to see who
owns it is a map. Typing a person's name to find where they live is a
people-finder, which is a different product with different duties.

---

# Tenkiller Live (previous purpose)

Tracking homes and land around Lake Tenkiller.

## The rule this app is built on

**Nothing is displayed that cannot be sourced.** There is no seed data, no
generator, no sample set and no placeholder imagery. If a feed is not connected
the app has no listings and says so plainly. That is the honest state, not a
bug.

Three consequences worth knowing before you change anything:

- **No scraping.** Zillow, Realtor.com and several local brokerage sites forbid
  automated access in their terms and block it in practice — `kw.com` and
  `land.com` return 403 to a plain request; `nestfully.com`,
  `tenkillerlakeandland.com` and `century21wright.com` block some clients too.
  Inventory comes from a licensed feed or not at all.
- **No re-hosted photos.** A listing's images stay where the seller published
  them. The detail screen links to the property's own page.
- **No invented links.** A record arriving without its own canonical listing URL,
  or without coordinates, is dropped rather than shown pointing somewhere it
  isn't. A link that goes to a search page instead of the property is a bug.

## Connecting a listing feed

Copy `.env.example` to `.env` and fill it in:

```bash
cp .env.example .env
```

| Variable | Meaning |
|---|---|
| `VITE_FEED_URL` | RESO Web API endpoint, e.g. `https://api.mlsgrid.com/v2/Property` |
| `VITE_FEED_TOKEN` | Bearer token issued with your IDX agreement |
| `VITE_FEED_NAME` | Label shown on the Data screen |

**Getting credentials is a licensing step, not a coding one.** Active listings
for this lake come from **MLSOK**, which covers all 77 Oklahoma counties
including Cherokee and Sequoyah, and delivers through MLS Grid over the RESO Web
API. Access requires an Oklahoma real estate licence and a signed IDX agreement
— see <https://mlsok.com/>. There is no portal that routes around this: Zillow,
Realtor.com, Lake Homes and Nestfully are all downstream licensees of MLS data
and none of them resell it onward.

`src/data/feed.js` is the only place listings enter the app. It speaks RESO;
pointing at a different provider means rewriting `normalise()` in that file and
nothing else.

## Running it

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

`npm run build` emits a static `dist/` — the whole app including manifest and
icons, servable from any host or subpath and installable to a phone home screen.

## Deploying

Live at <https://tenkillerlive.netlify.app>. To update, build and drop `dist/`
onto <https://app.netlify.com/drop>. `netlify.toml` is set up if you'd rather
connect this folder as a repo. `public/_headers` fixes the manifest content type
and marks fingerprinted assets immutable.

## Layout

```
src/
  App.jsx              screen routing, app state, feed loading
  theme.js             flag colours, badge tints, pill/segment/toggle helpers
  data/
    feed.js            THE listing source — RESO adapter, or nothing
    brokers.js         verified brokerage directory (see below)
    alerts.js          alert vocabulary: coves, triggers, onboarding copy
  lib/listing.js       formatting, filter matching, card/detail view models
  components/          LakeMap, tab bar, listing card, empty state
  screens/             map, detail, filters, saved/alerts, brokers, onboarding, data
```

Tracked listings and alert rules persist to `localStorage`. Listings themselves
are never cached — they come from the source on every load.

## The brokerage directory

`src/data/brokers.js` is the one dataset that ships populated, because it is the
one that could be verified. Every entry was checked on 15 Aug 2026 by fetching
the office's own site: the URL returns 200, the page is specifically about Lake
Tenkiller, and the phone number is the one that office publishes. Each record
carries a `verified` field recording exactly what was confirmed.

Six offices qualify. Keller Williams, McGraw Realtors and NextHome Professionals
are deliberately absent — real brokerages, but none publishes a Lake Tenkiller
page, so any claim that they cover this lake would be invented.

If you add an office, verify it the same way. An absent phone number is honest;
a guessed one sends someone to the wrong place.

## Network dependencies

- Esri World Imagery map tiles (`server.arcgisonline.com`)
- Geist and JetBrains Mono from Google Fonts
- your listing feed, if configured

No backend. No analytics. Nothing leaves the browser except the feed request.
