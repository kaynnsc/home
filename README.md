# Home — Storefront front page

The main landing page for your digital goods business: a banner, category-filtered service grid, and a "recently ordered" strip pulled live from your nota data (service name + date only — never customer details).

Shares the same Firebase project as pricelist, nota, and testi, and the same admin password.

## 1. Set up

Add to your Firestore rules:

```
match /home/data {
  allow read: if true;
  allow write: if true;
}
```

(Keep your existing rules for `pricelist/main`, `pricelist/guides`, `nota/data`, and `testi/data` as they are.)

## 2. Configure and run

```bash
cp .env.example .env
```
Paste in the same six Firebase values you're already using everywhere else.

```bash
npm install
npm run dev
```

## 3. Deploy

Same pattern as your other sites: its own GitHub repo, its own Cloudflare Pages/Workers project (build command `npm run build`, output `dist`), the same six `VITE_FIREBASE_*` environment variables, then a custom domain — e.g. `home.xiao-qi.my.id` — once you're ready to point it there.

## How it works

- **Banner, store name, categories**: all editable from Profile → admin login → Store settings.
- **Service grid**: tap a category chip to filter which services show (tap it again to clear the filter and show everything). Admin mode shows small edit/delete icons on each tile and an "Add service" button.
- **Recently ordered**: reads your `nota/data` Firestore document directly (read-only) and shows the 8 most recent orders by date. Deliberately limited to the service name and a relative date ("Today," "2d ago," etc.) — customer names, contacts, and prices are intentionally left out since this is a public page.
- **Search tab**: filters your service list by name as you type.
- **Cart and History tabs**: currently placeholders ("coming soon"). Building these out for real would mean a proper shopping-cart-and-checkout flow and a per-visitor order history — both meaningfully bigger builds than what's here now. Happy to build either out when you're ready.
- **Profile tab**: doubles as the admin panel (same shared login as your other sites) — manage store settings, categories, and the admin password from here.

## Data model

One Firestore document, `home/data`:

```
{
  settings: { storeName, bannerTitle, bannerSubtitle },
  categories: [{ id, label }],
  services: [{ id, label, emoji, categoryId }]
}
```
