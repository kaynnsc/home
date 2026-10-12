import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import {
  Moon, Sun, User, Search, ShoppingCart, Bookmark, BookmarkCheck, Bell, Lock, Unlock,
  Loader2, Check, X, Plus, Trash2, Pencil, ChevronDown, ChevronUp, ArrowLeft,
  Upload, Download, MessageCircle,
} from "lucide-react";

// ---- shared with nota/testi: same Firebase project, same admin password ----
const AUTH_DOC_REF = doc(db, "pricelist", "main"); // kept for backward-compat login only
const HOME_DOC_REF = doc(db, "home", "data");
const NOTA_DOC_REF = doc(db, "nota", "data");
const THEME_KEY = "home-theme";

const uid = () => Math.random().toString(36).slice(2, 10);

const DEFAULT_SETTINGS = {
  storeName: "GinzaCo",
  bannerTitle: "Big savings today",
  bannerSubtitle: "Check out our latest deals",
  tickerText: "Fast response \u00b7 Trusted seller \u00b7 Garansi tiap order",
  whatsappUsername: "",
  whatsappGreeting: "Hi! I'd like to order:",
  whatsappItemTemplate: "- {item} ({plan} {duration}) x{qty} \u2014 {price}",
  whatsappFooter: "Total: {total}\n\nThanks!",
};
const DEFAULT_DATA = { settings: DEFAULT_SETTINGS, categories: [], items: [] };

// ---- local device state: bookmarks + cart, no account needed ----
const BOOKMARKS_KEY = "home-bookmarks"; // array of "category::productName" keys
const CART_KEY = "home-cart"; // array of {cartId, category, productName, plan, duration, price, unit, qty}

function productKey(categoryLabel, productName) { return `${categoryLabel}::${productName}`; }
function getBookmarks() { try { return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || "[]"); } catch (e) { return []; } }
function setBookmarks(list) { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(list)); }
function getCart() { try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch (e) { return []; } }
function setCartStorage(list) { localStorage.setItem(CART_KEY, JSON.stringify(list)); }

function formatIDR(n) {
  const num = Number(n) || 0;
  return `Rp ${num.toLocaleString("id-ID")}`;
}
function formatRelativeDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const today = new Date();
  const diffDays = Math.round((today.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// fallback: if an item's name still has a duration baked in (old pricelist-style
// "Netflix 1 Bulan"), strip it so grouping still works without a separate Duration field.
const DURATION_TOKEN = /(\d+)\s*(hari|hr|day|days|minggu|mgg|week|weeks|bulan|bln|month|months|tahun|thn|year|years)/i;
function guessProductName(name) {
  const stripped = name.replace(DURATION_TOKEN, "").replace(/\s{2,}/g, " ").trim();
  return stripped || name;
}

function renderTemplate(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, key) => (vars[key] !== undefined ? vars[key] : `{${key}}`));
}

const THEMES = {
  light: {
    bg: "#F5F6FB", bgElevated: "#FFFFFF", card: "#EDEFF9", cardBorder: "#DEE1F2",
    ink: "#2C2B3D", inkMuted: "#5F5E75", inkFaint: "#9A99B3", accent: "#525BA6",
    accentSoft: "#E3E5F5", accent2: "#E8A9C4", accent2Soft: "#FBEAF1",
    positive: "#3FAE73", negative: "#E0607A", dangerSoft: "#FCE9EE",
    chipBg: "#EDEFF9", chipActiveBg: "#525BA6", chipActiveText: "#FFFFFF",
    navBg: "#FFFFFF", navBorder: "#DEE1F2", overlay: "rgba(44,43,61,0.45)", isDark: false,
  },
  dark: {
    bg: "#201F2C", bgElevated: "#2A2938", card: "#2A2938", cardBorder: "#3B3A4D",
    ink: "#EFEEF7", inkMuted: "#B4B2C8", inkFaint: "#7A7891", accent: "#8890D6",
    accentSoft: "#33324A", accent2: "#E8A9C4", accent2Soft: "#3A2C34",
    positive: "#5FC98F", negative: "#EA8598", dangerSoft: "#3A2530",
    chipBg: "#33324A", chipActiveBg: "#8890D6", chipActiveText: "#201F2C",
    navBg: "#252433", navBorder: "#3B3A4D", overlay: "rgba(0,0,0,0.6)", isDark: true,
  },
};

const FONT_LINK = `
@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito:wght@400;500;600;700&display=swap');
html, body, #root { margin: 0; padding: 0; width: 100%; }
* { box-sizing: border-box; }
body { overflow-x: hidden; }
button { transition: transform 0.12s ease, opacity 0.15s ease, background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease; }
button:active { transform: scale(0.94); }
input, select, textarea { transition: border-color 0.15s ease; }
@keyframes home-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes home-slide-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes home-scale-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
@keyframes home-pop { 0% { transform: scale(0.5); } 55% { transform: scale(1.25); } 100% { transform: scale(1); } }
@keyframes home-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.home-overlay { animation: home-fade-in 0.18s ease; }
.home-sheet { animation: home-slide-up 0.24s cubic-bezier(0.34, 1.56, 0.64, 1); }
.home-card { animation: home-scale-in 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); }
.home-ticker-track { display: inline-flex; animation: home-ticker 16s linear infinite; white-space: nowrap; }
`;

export default function App() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) === "dark"; } catch (e) { return false; }
  });
  const [authPassword, setAuthPassword] = useState(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [loginError, setLoginError] = useState("");

  const [data, setData] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [notaOrders, setNotaOrders] = useState(null);
  const [notaApps, setNotaApps] = useState(null);

  const [tab, setTab] = useState("home"); // home | search | cart | saved | profile
  const [activeCategory, setActiveCategory] = useState(null);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [detailProduct, setDetailProduct] = useState(null); // grouped product object, or null
  const [editingItem, setEditingItem] = useState(null); // raw item being added/edited by admin, or null
  const [cart, setCartState] = useState(getCart());
  const [bookmarks, setBookmarksState] = useState(getBookmarks());
  const editingRef = useRef(false);

  const T = dark ? THEMES.dark : THEMES.light;

  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, dark ? "dark" : "light"); } catch (e) {}
    document.body.style.background = T.bg;
    document.documentElement.style.background = T.bg;
  }, [dark, T.bg]);

  const flashToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  useEffect(() => {
    const unsub = onSnapshot(AUTH_DOC_REF, (snap) => {
      setAuthPassword(snap.exists() ? snap.data().password || "admin123" : "admin123");
      setAuthLoaded(true);
    }, () => { setAuthPassword("admin123"); setAuthLoaded(true); });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(HOME_DOC_REF, (snap) => {
      if (!snap.exists()) {
        setDoc(HOME_DOC_REF, DEFAULT_DATA).catch(() => setConnectionError(true));
        setData(DEFAULT_DATA);
      } else if (!editingRef.current) {
        const d = snap.data();
        setData({
          settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) },
          categories: d.categories || [],
          items: d.items || [],
        });
      }
      setDataLoaded(true);
    }, (err) => { console.error(err); setConnectionError(true); setData(DEFAULT_DATA); setDataLoaded(true); });
    return () => unsub();
  }, []);

  // read-only: "recently ordered" from nota — service name + date only, never customer info
  useEffect(() => {
    const unsub = onSnapshot(NOTA_DOC_REF, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setNotaOrders(d.orders || []);
        setNotaApps((d.settings && d.settings.apps) || []);
      } else { setNotaOrders([]); setNotaApps([]); }
    }, () => { setNotaOrders([]); setNotaApps([]); });
    return () => unsub();
  }, []);

  const persist = useCallback(async (next) => {
    setData(next);
    try { await setDoc(HOME_DOC_REF, next); setConnectionError(false); }
    catch (e) { setConnectionError(true); flashToast("Couldn't save — check your connection"); }
  }, []);

  const handleLogin = () => {
    if (pwInput === authPassword) { setIsAdmin(true); setShowLogin(false); setPwInput(""); setLoginError(""); }
    else setLoginError("Incorrect password.");
  };

  const toggleBookmark = (key) => {
    const next = bookmarks.includes(key) ? bookmarks.filter((k) => k !== key) : [...bookmarks, key];
    setBookmarksState(next);
    setBookmarks(next);
  };

  const addToCart = (entry) => {
    const next = [...cart, { ...entry, cartId: uid(), qty: 1 }];
    setCartState(next);
    setCartStorage(next);
    flashToast("Added to cart");
  };
  const updateCartQty = (cartId, qty) => {
    const next = cart.map((c) => (c.cartId === cartId ? { ...c, qty: Math.max(1, qty) } : c));
    setCartState(next); setCartStorage(next);
  };
  const removeFromCart = (cartId) => {
    const next = cart.filter((c) => c.cartId !== cartId);
    setCartState(next); setCartStorage(next);
  };
  const clearCart = () => { setCartState([]); setCartStorage([]); };

  // --- MOVED HOOKS AND DATA EXTRACTION ABOVE THE EARLY RETURN ---
  // We use optional chaining (?.) so this doesn't crash before data loads
  const categories = data?.categories || [];
  const items = data?.items || [];

  // group flat items into products (same category + same productName)
  const groupedProducts = useMemo(() => {
    const map = new Map();
    items.forEach((it) => {
      const productName = it.productName || guessProductName(it.name || "");
      const key = productKey(it.category, productName);
      if (!map.has(key)) {
        map.set(key, {
          key, category: it.category, productName,
          description: it.description || "", imageUrl: it.imageUrl || "", terms: it.terms || "",
          variants: [],
        });
      }
      const group = map.get(key);
      if (it.description && !group.description) group.description = it.description;
      if (it.imageUrl && !group.imageUrl) group.imageUrl = it.imageUrl;
      if (it.terms && !group.terms) group.terms = it.terms;
      group.variants.push({ id: it.id, plan: it.plan || "", duration: it.duration || it.unit || "", price: Number(it.price) || 0, unit: it.unit || "" });
    });
    return Array.from(map.values());
  }, [items]);

  const recentOrders = useMemo(() => {
    if (!notaOrders) return [];
    return [...notaOrders].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 8)
      // Added optional chaining to notaApps below as a safety precaution
      .map((o) => ({ id: o.id, date: o.date, appLabel: (notaApps?.find((a) => a.id === o.appId) || {}).label || "Service" }));
  }, [notaOrders, notaApps]);
  // -------------------------------------------------------------

  if (!authLoaded || !dataLoaded || !data) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg }}>
        <style>{FONT_LINK}</style>
        <Loader2 className="animate-spin" color={T.accent} size={26} />
      </div>
    );
  }

  const filteredProducts = activeCategory ? groupedProducts.filter((p) => p.category === activeCategory) : groupedProducts;
  const searchResults = query.trim() ? groupedProducts.filter((p) => p.productName.toLowerCase().includes(query.toLowerCase())) : [];
  const savedProducts = groupedProducts.filter((p) => bookmarks.includes(p.key));

  const saveItem = (item) => {
    const exists = items.some((i) => i.id === item.id);
    const nextItems = exists ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item];
    persist({ ...data, items: nextItems });
    setEditingItem(null);
    flashToast(exists ? "Item updated" : "Item added");
  };
  const deleteItem = (id) => persist({ ...data, items: items.filter((i) => i.id !== id) });
  const addCategory = () => persist({ ...data, categories: [...categories, { id: uid(), label: "New category" }] });
  const renameCategory = (id, label) => {
    const old = categories.find((c) => c.id === id);
    persist({
      ...data,
      categories: categories.map((c) => (c.id === id ? { ...c, label } : c)),
      items: old ? items.map((i) => (i.category === old.label ? { ...i, category: label } : i)) : items,
    });
  };
  const deleteCategory = (id) => {
    const cat = categories.find((c) => c.id === id);
    persist({ ...data, categories: categories.filter((c) => c.id !== id), items: cat ? items.filter((i) => i.category !== cat.label) : items });
  };

  const whatsappUrl = (lines, total) => {
    const greeting = data.settings.whatsappGreeting || "";
    const footer = renderTemplate(data.settings.whatsappFooter || "", { total: formatIDR(total) });
    const body = [greeting, "", ...lines, "", footer].filter((l) => l !== undefined).join("\n");
    const username = (data.settings.whatsappUsername || "").trim();
    return `https://wa.me/${username}?text=${encodeURIComponent(body)}`;
  };

  const orderSingle = (product, variant, qty) => {
    const line = renderTemplate(data.settings.whatsappItemTemplate, {
      item: product.productName, plan: variant.plan || "-", duration: variant.duration || "-", price: formatIDR(variant.price), qty,
    });
    window.open(whatsappUrl([line], variant.price * qty), "_blank");
  };

  const orderCart = () => {
    const lines = cart.map((c) => renderTemplate(data.settings.whatsappItemTemplate, {
      item: c.productName, plan: c.plan || "-", duration: c.duration || "-", price: formatIDR(c.price), qty: c.qty,
    }));
    const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
    window.open(whatsappUrl(lines, total), "_blank");
  };

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: T.bg, fontFamily: "'Nunito', sans-serif", color: T.ink }}>
      <style>{FONT_LINK}</style>

      {connectionError && (
        <div style={{ background: T.dangerSoft, color: T.negative, fontSize: 12.5, padding: "8px 20px", textAlign: "center" }}>
          Couldn't connect to Firebase. Check your .env / Cloudflare environment variables and Firestore rules.
        </div>
      )}

      <div style={{ maxWidth: 560, margin: "0 auto", paddingBottom: 90 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 14px", gap: 10 }}>
          {tab !== "home" ? (
            <button onClick={() => setTab("home")} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0, color: T.ink }}>
              <div style={{ width: 36, height: 36, borderRadius: 12, background: T.card, border: `1px solid ${T.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ArrowLeft size={17} />
              </div>
            </button>
          ) : (
            <button style={{ width: 40, height: 40, borderRadius: "50%", background: T.card, border: `1px solid ${T.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "center", color: T.accent, cursor: "pointer", flexShrink: 0 }}>
              <User size={19} />
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
            <div style={{ fontFamily: "'Baloo 2', cursive", fontSize: 16, fontWeight: 700, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {tab === "home" ? data.settings.storeName : tab === "search" ? "Search" : tab === "cart" ? "Your cart" : tab === "saved" ? "Saved" : (isAdmin ? "Admin" : "Profile")}
            </div>
          </div>
          <button onClick={() => setDark(!dark)} style={{ width: 40, height: 40, borderRadius: "50%", background: T.card, border: `1px solid ${T.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "center", color: T.ink, cursor: "pointer", flexShrink: 0 }}>
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>

        {tab === "home" && (
          <HomeTab
            T={T} data={data} categories={categories} filteredProducts={filteredProducts}
            activeCategory={activeCategory} setActiveCategory={setActiveCategory} recentOrders={recentOrders}
            bookmarks={bookmarks} onOpenProduct={setDetailProduct}
          />
        )}
        {tab === "search" && <SearchTab T={T} query={query} setQuery={setQuery} results={searchResults} bookmarks={bookmarks} onOpenProduct={setDetailProduct} />}
        {tab === "cart" && (
          <CartTab T={T} cart={cart} onUpdateQty={updateCartQty} onRemove={removeFromCart} onOrderAll={orderCart} onClear={clearCart} />
        )}
        {tab === "saved" && <SavedTab T={T} products={savedProducts} bookmarks={bookmarks} onOpenProduct={setDetailProduct} />}
        {tab === "profile" && (
          <ProfileTab
            T={T} isAdmin={isAdmin} data={data} categories={categories} items={items} persist={persist}
            flashToast={flashToast} authPassword={authPassword} onLoginClick={() => setShowLogin(true)}
            onLogout={() => setIsAdmin(false)} onAddCategory={addCategory} onRenameCategory={renameCategory}
            onDeleteCategory={deleteCategory} onEditItem={setEditingItem} onDeleteItem={deleteItem} editingRef={editingRef}
          />
        )}
      </div>

      {/* bottom nav */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: T.navBg, borderTop: `1px solid ${T.navBorder}`, display: "flex", justifyContent: "space-around", alignItems: "center", padding: "10px 14px calc(10px + env(safe-area-inset-bottom))", zIndex: 20 }}>
        <NavBtn T={T} icon={<HomeIcon size={20} />} label="Home" active={tab === "home"} onClick={() => setTab("home")} />
        <NavBtn T={T} icon={<Search size={20} />} label="Search" active={tab === "search"} onClick={() => setTab("search")} />
        <NavBtn T={T} icon={<ShoppingCart size={20} />} label="Cart" active={tab === "cart"} badge={cart.reduce((s, c) => s + c.qty, 0)} onClick={() => setTab("cart")} />
        <NavBtn T={T} icon={<Bookmark size={20} />} label="Saved" active={tab === "saved"} onClick={() => setTab("saved")} />
        <NavBtn T={T} icon={<User size={20} />} label={isAdmin ? "Admin" : "Profile"} active={tab === "profile"} onClick={() => setTab("profile")} />
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 84, left: "50%", transform: "translateX(-50%)", background: T.accent, color: "#fff", padding: "10px 18px", borderRadius: 999, fontSize: 13.5, display: "flex", alignItems: "center", gap: 6, zIndex: 30 }}>
          <Check size={14} /> {toast}
        </div>
      )}

      {showLogin && (
        <Modal T={T} onClose={() => { setShowLogin(false); setPwInput(""); setLoginError(""); }} title="Admin login">
          <p style={{ fontSize: 13.5, color: T.inkMuted, marginTop: -6, marginBottom: 14 }}>Enter the admin password (shared with your other sites).</p>
          <input type="password" autoFocus value={pwInput} onChange={(e) => setPwInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLogin()} placeholder="Password" style={inputStyle(T)} />
          {loginError && <p style={{ color: T.negative, fontSize: 12.5, marginTop: 6 }}>{loginError}</p>}
          <button onClick={handleLogin} style={{ ...primaryBtnStyle(T), marginTop: 14, width: "100%" }}>Unlock</button>
        </Modal>
      )}

      {detailProduct && (
        <ProductDetailOverlay
          T={T} product={detailProduct} onClose={() => setDetailProduct(null)}
          isBookmarked={bookmarks.includes(detailProduct.key)} onToggleBookmark={() => toggleBookmark(detailProduct.key)}
          onAddToCart={(variant, qty) => addToCart({ category: detailProduct.category, productName: detailProduct.productName, imageUrl: detailProduct.imageUrl, plan: variant.plan, duration: variant.duration, price: variant.price, unit: variant.unit })}
          onOrderNow={(variant, qty) => orderSingle(detailProduct, variant, qty)}
          isAdmin={isAdmin}
          onEdit={() => { setDetailProduct(null); setEditingItem(items.find((i) => (i.productName || guessProductName(i.name || "")) === detailProduct.productName && i.category === detailProduct.category) || {}); }}
        />
      )}

      {editingItem !== null && (
        <ItemModal T={T} item={editingItem} categories={categories} defaultCategory={activeCategory ? categories.find((c) => c.id === activeCategory)?.label : ""} onClose={() => setEditingItem(null)} onSave={saveItem} editingRef={editingRef} />
      )}
    </div>
  );
}

function HomeIcon(props) {
  return <svg width={props.size} height={props.size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>;
}

// ---------------- HOME TAB ----------------

function HomeTab({ T, data, categories, filteredProducts, activeCategory, setActiveCategory, recentOrders, bookmarks, onOpenProduct }) {
  return (
    <div style={{ padding: "0 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.bgElevated, border: `1px solid ${T.cardBorder}`, borderRadius: 999, padding: "10px 16px", marginBottom: 14 }}>
        <Bell size={16} color={T.inkFaint} />
        <span style={{ fontSize: 13.5, color: T.inkFaint }}>No new notifications</span>
      </div>

      <div style={{ background: `linear-gradient(135deg, ${T.accent}, ${T.accent2})`, borderRadius: 20, padding: "26px 20px", marginBottom: 12, color: "#fff", textAlign: "center" }}>
        <div style={{ fontFamily: "'Baloo 2', cursive", fontSize: 20, fontWeight: 700 }}>{data.settings.bannerTitle}</div>
        <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>{data.settings.bannerSubtitle}</div>
      </div>

      {data.settings.tickerText && (
        <div style={{ background: T.ink, borderRadius: 999, padding: "8px 0", marginBottom: 18, overflow: "hidden" }}>
          <div className="home-ticker-track">
            <span style={{ color: T.bg, fontSize: 12, fontWeight: 600, paddingRight: 40 }}>{data.settings.tickerText}</span>
            <span style={{ color: T.bg, fontSize: 12, fontWeight: 600, paddingRight: 40 }}>{data.settings.tickerText}</span>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 16, paddingBottom: 2 }}>
        {categories.map((c) => (
          <button key={c.id} onClick={() => setActiveCategory(activeCategory === c.id ? null : c.id)}
            style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "'Nunito', sans-serif",
              background: activeCategory === c.id ? T.chipActiveBg : T.chipBg, color: activeCategory === c.id ? T.chipActiveText : T.inkMuted }}>
            {c.label}
          </button>
        ))}
      </div>

      <ProductGrid T={T} products={filteredProducts} bookmarks={bookmarks} onOpenProduct={onOpenProduct} emptyText="No products in this category yet." />

      <div style={{ fontFamily: "'Baloo 2', cursive", fontSize: 15, fontWeight: 700, color: T.ink, margin: "22px 0 10px" }}>Recently ordered</div>
      {recentOrders.length === 0 ? (
        <div style={{ textAlign: "center", color: T.inkFaint, fontSize: 12.5, padding: "16px 0" }}>Nothing ordered yet.</div>
      ) : (
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }}>
          {recentOrders.map((o) => (
            <div key={o.id} className="home-card" style={{ flexShrink: 0, width: 108, background: T.bgElevated, border: `1px solid ${T.cardBorder}`, borderRadius: 16, padding: 12 }}>
              <div style={{ width: 30, height: 30, borderRadius: 10, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", color: T.accent, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{o.appLabel[0].toUpperCase()}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.appLabel}</div>
              <div style={{ fontSize: 10.5, color: T.inkFaint, marginTop: 2 }}>{formatRelativeDate(o.date)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductGrid({ T, products, bookmarks, onOpenProduct, emptyText }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
      {products.map((p) => (
        <ProductTile key={p.key} T={T} product={p} isBookmarked={bookmarks.includes(p.key)} onClick={() => onOpenProduct(p)} />
      ))}
      {products.length === 0 && <div style={{ gridColumn: "1 / -1", textAlign: "center", color: T.inkFaint, fontSize: 13, padding: "20px 0" }}>{emptyText}</div>}
    </div>
  );
}

function ProductTile({ T, product, isBookmarked, onClick }) {
  const minPrice = product.variants.length ? Math.min(...product.variants.map((v) => v.price)) : 0;
  return (
    <button onClick={onClick} className="home-card" style={{ position: "relative", background: T.bgElevated, border: `1px solid ${T.cardBorder}`, borderRadius: 18, padding: "14px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center", cursor: "pointer" }}>
      {isBookmarked && <BookmarkCheck size={13} color={T.accent2} style={{ position: "absolute", top: 6, right: 6 }} />}
      {product.imageUrl ? (
        <img src={product.imageUrl} alt={product.productName} style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover" }} onError={(e) => (e.target.style.display = "none")} />
      ) : (
        <div style={{ width: 44, height: 44, borderRadius: 12, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", color: T.accent, fontWeight: 700, fontFamily: "'Baloo 2', cursive" }}>
          {product.productName[0]?.toUpperCase()}
        </div>
      )}
      <div style={{ fontSize: 11.5, fontWeight: 700, color: T.ink, lineHeight: 1.2 }}>{product.productName}</div>
      <div style={{ fontSize: 10.5, color: T.accent, fontWeight: 600 }}>from {formatIDR(minPrice)}</div>
    </button>
  );
}

// ---------------- SEARCH / SAVED TABS ----------------

function SearchTab({ T, query, setQuery, results, bookmarks, onOpenProduct }) {
  return (
    <div style={{ padding: "0 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.bgElevated, border: `1px solid ${T.cardBorder}`, borderRadius: 999, padding: "10px 16px", marginBottom: 16 }}>
        <Search size={16} color={T.inkFaint} />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" style={{ border: "none", outline: "none", background: "transparent", flex: 1, minWidth: 0, fontSize: 16, color: T.ink, fontFamily: "'Nunito', sans-serif" }} />
      </div>
      {!query.trim() ? (
        <div style={{ textAlign: "center", color: T.inkFaint, fontSize: 13, padding: "30px 0" }}>Start typing to search.</div>
      ) : (
        <ProductGrid T={T} products={results} bookmarks={bookmarks} onOpenProduct={onOpenProduct} emptyText="No matches." />
      )}
    </div>
  );
}

function SavedTab({ T, products, bookmarks, onOpenProduct }) {
  return (
    <div style={{ padding: "0 20px" }}>
      <ProductGrid T={T} products={products} bookmarks={bookmarks} onOpenProduct={onOpenProduct} emptyText="Nothing saved yet — tap the bookmark icon on any product to save it here." />
    </div>
  );
}

// ---------------- CART TAB ----------------

function CartTab({ T, cart, onUpdateQty, onRemove, onOrderAll, onClear }) {
  const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const itemCount = cart.reduce((s, c) => s + c.qty, 0);

  return (
    <div style={{ padding: "0 20px", paddingBottom: cart.length > 0 ? 100 : 0 }}>
      {cart.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px" }}>
          <ShoppingCart size={40} color={T.inkFaint} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 13.5, color: T.inkFaint }}>Your cart is empty.</div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 2px 12px" }}>
            <span style={{ fontSize: 12.5, color: T.inkMuted }}>{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
            <button onClick={onClear} style={{ background: "none", border: "none", color: T.negative, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Clear cart</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {cart.map((c) => (
              <div key={c.cartId} className="home-card" style={{ background: T.bgElevated, border: `1px solid ${T.cardBorder}`, borderRadius: 18, padding: 12, display: "flex", gap: 12, alignItems: "flex-start" }}>
                {c.imageUrl ? (
                  <img src={c.imageUrl} alt={c.productName} style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover", flexShrink: 0 }} onError={(e) => (e.target.style.display = "none")} />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: 14, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", color: T.accent, fontWeight: 700, fontSize: 18, fontFamily: "'Baloo 2', cursive", flexShrink: 0 }}>
                    {c.productName[0]?.toUpperCase()}
                  </div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, lineHeight: 1.25 }}>{c.productName}</div>
                    <button onClick={() => onRemove(c.cartId)} style={{ ...iconBtnStyle(T), width: 24, height: 24, background: "transparent", color: T.inkFaint, flexShrink: 0 }}><Trash2 size={13} /></button>
                  </div>
                  {(c.plan || c.duration) && (
                    <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1 }}>{[c.plan, c.duration].filter(Boolean).join(" \u00b7 ")}</div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                    <div>
                      <div style={{ fontFamily: "'Baloo 2', cursive", fontSize: 15, fontWeight: 700, color: T.accent }}>{formatIDR(c.price * c.qty)}</div>
                      {c.qty > 1 && <div style={{ fontSize: 10, color: T.inkFaint }}>{formatIDR(c.price)} each</div>}
                    </div>

                    {/* Shopee/Gojek-style pill stepper */}
                    <div style={{ display: "flex", alignItems: "center", background: T.card, borderRadius: 999, border: `1px solid ${T.cardBorder}`, overflow: "hidden" }}>
                      <button onClick={() => (c.qty === 1 ? onRemove(c.cartId) : onUpdateQty(c.cartId, c.qty - 1))} style={stepperBtnStyle(T)}>
                        {c.qty === 1 ? <Trash2 size={13} /> : "\u2212"}
                      </button>
                      <span style={{ fontSize: 13, fontWeight: 700, width: 26, textAlign: "center", color: T.ink }}>{c.qty}</span>
                      <button onClick={() => onUpdateQty(c.cartId, c.qty + 1)} style={{ ...stepperBtnStyle(T), color: T.accent }}>+</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* sticky checkout bar */}
          <div style={{ position: "fixed", left: 0, right: 0, bottom: 64, background: T.navBg, borderTop: `1px solid ${T.navBorder}`, padding: "12px 20px calc(10px + env(safe-area-inset-bottom))", zIndex: 19 }}>
            <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, color: T.inkMuted }}>Total</div>
                <div style={{ fontFamily: "'Baloo 2', cursive", fontSize: 17, fontWeight: 700, color: T.ink }}>{formatIDR(total)}</div>
              </div>
              <button onClick={onOrderAll} style={{ ...primaryBtnStyle(T), background: "#25D366", flex: 1.3 }}>
                <MessageCircle size={16} /> Order via WhatsApp
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function stepperBtnStyle(T) {
  return { width: 30, height: 30, border: "none", background: "transparent", color: T.inkMuted, cursor: "pointer", fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" };
}

// ---------------- PRODUCT DETAIL OVERLAY ----------------

function ProductDetailOverlay({ T, product, onClose, isBookmarked, onToggleBookmark, onAddToCart, onOrderNow, isAdmin, onEdit }) {
  const plans = [...new Set(product.variants.map((v) => v.plan).filter(Boolean))];
  const [plan, setPlan] = useState(plans[0] || "");
  const durations = product.variants.filter((v) => !plan || v.plan === plan).map((v) => v.duration).filter(Boolean);
  const [duration, setDuration] = useState(durations[0] || "");
  const [showTerms, setShowTerms] = useState(false);
  const [qty, setQty] = useState(1);

  const selectedVariant = product.variants.find((v) => (!plans.length || v.plan === plan) && (!durations.length || v.duration === duration)) || product.variants[0];

  return (
    <div className="home-overlay" style={{ position: "fixed", inset: 0, background: T.overlay, display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 55 }} onClick={onClose}>
      <div className="home-sheet" onClick={(e) => e.stopPropagation()} style={{ background: T.bg, borderRadius: "24px 24px 0 0", padding: 20, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
          <button onClick={onClose} style={iconBtnStyle(T)}><X size={18} /></button>
        </div>

        <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.productName} style={{ width: 92, height: 92, borderRadius: 18, objectFit: "cover" }} onError={(e) => (e.target.style.display = "none")} />
            ) : (
              <div style={{ width: 92, height: 92, borderRadius: 18, background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", color: T.accent, fontWeight: 700, fontSize: 28, fontFamily: "'Baloo 2', cursive" }}>
                {product.productName[0]?.toUpperCase()}
              </div>
            )}
            <button onClick={onToggleBookmark} style={{ position: "absolute", top: -6, right: -6, width: 30, height: 30, borderRadius: "50%", background: T.bgElevated, border: `1px solid ${T.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "center", color: isBookmarked ? T.accent2 : T.inkFaint, cursor: "pointer" }}>
              {isBookmarked ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
            </button>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Baloo 2', cursive", fontSize: 19, fontWeight: 700, color: T.ink }}>{product.productName}</div>
            {product.description && <div style={{ fontSize: 12.5, color: T.inkMuted, marginTop: 4, lineHeight: 1.4 }}>{product.description}</div>}
          </div>
        </div>

        {product.terms && (
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => setShowTerms(!showTerms)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: `${T.card}CC`, border: `1px solid ${T.cardBorder}`, borderRadius: 14, padding: "12px 14px", cursor: "pointer" }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>Terms & conditions</span>
              {showTerms ? <ChevronUp size={16} color={T.inkMuted} /> : <ChevronDown size={16} color={T.inkMuted} />}
            </button>
            {showTerms && (
              <div style={{ background: `${T.card}99`, border: `1px solid ${T.cardBorder}`, borderTop: "none", borderRadius: "0 0 14px 14px", padding: "0 14px 12px", fontSize: 12.5, color: T.inkMuted, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                {product.terms}
              </div>
            )}
          </div>
        )}

        {plans.length > 0 && (
          <Field T={T} label="Plan">
            <select value={plan} onChange={(e) => { setPlan(e.target.value); setDuration(""); }} style={inputStyle(T)}>
              {plans.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
        )}
        {durations.length > 0 && (
          <div style={{ marginTop: plans.length ? 10 : 0 }}>
            <Field T={T} label="Duration">
              <select value={duration} onChange={(e) => setDuration(e.target.value)} style={inputStyle(T)}>
                {[...new Set(durations)].map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
          </div>
        )}

        <div style={{ background: T.accentSoft, borderRadius: 14, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", margin: "16px 0" }}>
          <span style={{ fontSize: 12.5, color: T.inkMuted }}>Price</span>
          <span style={{ fontFamily: "'Baloo 2', cursive", fontSize: 20, fontWeight: 700, color: T.accent }}>{selectedVariant ? formatIDR(selectedVariant.price) : "—"}</span>
        </div>

        {isAdmin && (
          <button onClick={onEdit} style={{ ...ghostBtnStyle(T), width: "100%", marginBottom: 12 }}><Pencil size={13} /> Edit this product</button>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => selectedVariant && onAddToCart(selectedVariant, qty)} disabled={!selectedVariant} style={{ ...ghostBtnStyle(T), flex: 1, borderStyle: "solid", opacity: selectedVariant ? 1 : 0.5 }}>
            <ShoppingCart size={15} /> Add to cart
          </button>
          <button onClick={() => selectedVariant && onOrderNow(selectedVariant, qty)} disabled={!selectedVariant} style={{ ...primaryBtnStyle(T), flex: 1, background: "#25D366", opacity: selectedVariant ? 1 : 0.5 }}>
            <MessageCircle size={15} /> Order now
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------- PROFILE TAB ----------------

function ProfileTab({ T, isAdmin, data, categories, items, persist, flashToast, authPassword, onLoginClick, onLogout, onAddCategory, onRenameCategory, onDeleteCategory, onEditItem, onDeleteItem, editingRef }) {
  if (!isAdmin) {
    return (
      <div style={{ padding: "0 20px", textAlign: "center" }}>
        <div style={{ width: 60, height: 60, borderRadius: "50%", background: T.accentSoft, display: "flex", alignItems: "center", justifyContent: "center", color: T.accent, margin: "20px auto" }}>
          <User size={26} />
        </div>
        <p style={{ fontSize: 13.5, color: T.inkMuted, marginBottom: 16 }}>Nothing personal to show yet — accounts aren't part of this site.</p>
        <button onClick={onLoginClick} style={{ ...ghostBtnStyle(T), margin: "0 auto" }}><Lock size={14} /> Log in as admin</button>
      </div>
    );
  }
  return <AdminPanel T={T} data={data} categories={categories} items={items} persist={persist} flashToast={flashToast} authPassword={authPassword} onLogout={onLogout} onAddCategory={onAddCategory} onRenameCategory={onRenameCategory} onDeleteCategory={onDeleteCategory} onEditItem={onEditItem} onDeleteItem={onDeleteItem} editingRef={editingRef} />;
}

function AdminPanel({ T, data, categories, items, persist, flashToast, authPassword, onLogout, onAddCategory, onRenameCategory, onDeleteCategory, onEditItem, onDeleteItem, editingRef }) {
  const [storeName, setStoreName] = useState(data.settings.storeName);
  const [bannerTitle, setBannerTitle] = useState(data.settings.bannerTitle);
  const [bannerSubtitle, setBannerSubtitle] = useState(data.settings.bannerSubtitle);
  const [tickerText, setTickerText] = useState(data.settings.tickerText);
  const [waUsername, setWaUsername] = useState(data.settings.whatsappUsername);
  const [waGreeting, setWaGreeting] = useState(data.settings.whatsappGreeting);
  const [waItemTpl, setWaItemTpl] = useState(data.settings.whatsappItemTemplate);
  const [waFooter, setWaFooter] = useState(data.settings.whatsappFooter);
  const [newPw, setNewPw] = useState("");
  const fileInputRef = useRef(null);
  const [importBusy, setImportBusy] = useState(false);

  const saveSettings = (patch) => persist({ ...data, settings: { ...data.settings, ...patch } });

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const rows = items.map((i) => ({
      Category: i.category, ProductName: i.productName, Plan: i.plan || "", Duration: i.duration || "",
      Price: i.price, Unit: i.unit || "", Description: i.description || "", Terms: i.terms || "", "Image URL": i.imageUrl || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Catalog");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "catalog.xlsx";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    flashToast("Exported");
  };

  const importExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportBusy(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(evt.target.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        const newCategories = [...categories];
        const newItems = rows.map((r) => {
          const lower = {}; Object.keys(r).forEach((k) => (lower[k.toLowerCase().replace(/\s/g, "")] = r[k]));
          const categoryLabel = lower.category || "Uncategorized";
          if (!newCategories.some((c) => c.label === categoryLabel)) newCategories.push({ id: uid(), label: categoryLabel });
          return {
            id: uid(), category: categoryLabel,
            productName: lower.productname || guessProductName(lower.name || ""),
            plan: lower.plan || "", duration: lower.duration || "",
            price: parseFloat(lower.price) || 0, unit: lower.unit || "",
            description: lower.description || "", terms: lower.terms || "", imageUrl: lower.imageurl || "",
          };
        }).filter((i) => i.productName);
        persist({ ...data, categories: newCategories, items: [...items, ...newItems] });
        flashToast(`Imported ${newItems.length} items`);
      } catch (err) { flashToast("Couldn't read that file"); }
      finally { setImportBusy(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
    };
    reader.readAsArrayBuffer(file);
  };

  const changePassword = async () => {
    if (!newPw.trim()) return;
    try { await setDoc(AUTH_DOC_REF, { password: newPw.trim() }, { merge: true }); flashToast("Password updated"); setNewPw(""); }
    catch (e) { flashToast("Couldn't update password"); }
  };

  return (
    <div style={{ padding: "0 20px" }}>
      <Section T={T} title="Store">
        <Field T={T} label="Store name"><input value={storeName} onChange={(e) => setStoreName(e.target.value)} onBlur={() => saveSettings({ storeName })} style={inputStyle(T)} /></Field>
        <div style={{ height: 10 }} />
        <Field T={T} label="Banner title"><input value={bannerTitle} onChange={(e) => setBannerTitle(e.target.value)} onBlur={() => saveSettings({ bannerTitle })} style={inputStyle(T)} /></Field>
        <div style={{ height: 10 }} />
        <Field T={T} label="Banner subtitle"><input value={bannerSubtitle} onChange={(e) => setBannerSubtitle(e.target.value)} onBlur={() => saveSettings({ bannerSubtitle })} style={inputStyle(T)} /></Field>
        <div style={{ height: 10 }} />
        <Field T={T} label="Scrolling announcement (ticker)"><input value={tickerText} onChange={(e) => setTickerText(e.target.value)} onBlur={() => saveSettings({ tickerText })} style={inputStyle(T)} /></Field>
      </Section>

      <Section T={T} title="Categories">
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          {categories.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input defaultValue={c.label} onFocus={() => (editingRef.current = true)} onBlur={(e) => { editingRef.current = false; onRenameCategory(c.id, e.target.value); }} onKeyDown={(e) => e.key === "Enter" && e.target.blur()} style={{ ...inputStyle(T), flex: 1 }} />
              <button onClick={() => onDeleteCategory(c.id)} style={{ ...iconBtnStyle(T), color: T.negative }}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <button onClick={onAddCategory} style={{ ...ghostBtnStyle(T), width: "100%" }}><Plus size={14} /> Add category</button>
      </Section>

      <Section T={T} title="Catalog">
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          <button onClick={() => onEditItem({})} style={{ ...primaryBtnStyle(T) }}><Plus size={14} /> Add item</button>
          <button onClick={exportExcel} style={ghostBtnStyle(T)}><Download size={14} /> Export catalog (Excel)</button>
          <button onClick={() => fileInputRef.current && fileInputRef.current.click()} style={ghostBtnStyle(T)}>
            {importBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Import catalog (Excel)
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={importExcel} style={{ display: "none" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((i) => (
            <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, background: T.bgElevated, border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: "8px 10px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{i.productName}</div>
                <div style={{ fontSize: 11, color: T.inkMuted }}>{i.category} {i.plan && `· ${i.plan}`} {i.duration && `· ${i.duration}`} · {formatIDR(i.price)}</div>
              </div>
              <button onClick={() => onEditItem(i)} style={iconBtnStyle(T)}><Pencil size={13} /></button>
              <button onClick={() => onDeleteItem(i.id)} style={{ ...iconBtnStyle(T), color: T.negative }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </Section>

      <Section T={T} title="WhatsApp ordering">
        <Field T={T} label="WhatsApp username (wa.me/username — exact capitalization)">
          <input value={waUsername} onChange={(e) => setWaUsername(e.target.value)} onBlur={() => saveSettings({ whatsappUsername: waUsername })} style={inputStyle(T)} placeholder="Athhena" />
        </Field>
        <div style={{ height: 10 }} />
        <Field T={T} label="Greeting line">
          <input value={waGreeting} onChange={(e) => setWaGreeting(e.target.value)} onBlur={() => saveSettings({ whatsappGreeting: waGreeting })} style={inputStyle(T)} />
        </Field>
        <div style={{ height: 10 }} />
        <Field T={T} label="Per-item line — placeholders: {item} {plan} {duration} {price} {qty}">
          <textarea value={waItemTpl} onChange={(e) => setWaItemTpl(e.target.value)} onBlur={() => saveSettings({ whatsappItemTemplate: waItemTpl })} rows={2} style={{ ...inputStyle(T), resize: "vertical" }} />
        </Field>
        <div style={{ height: 10 }} />
        <Field T={T} label="Footer — placeholder: {total}">
          <textarea value={waFooter} onChange={(e) => setWaFooter(e.target.value)} onBlur={() => saveSettings({ whatsappFooter: waFooter })} rows={2} style={{ ...inputStyle(T), resize: "vertical" }} />
        </Field>
      </Section>

      <Section T={T} title="Admin password">
        <p style={{ fontSize: 11.5, color: T.inkFaint, marginBottom: 8 }}>Shared with pricelist, nota and testimonials.</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password" style={{ ...inputStyle(T), flex: 1 }} />
          <button onClick={changePassword} style={primaryBtnStyle(T)}>Save</button>
        </div>
      </Section>

      <button onClick={onLogout} style={{ ...ghostBtnStyle(T), color: T.negative, borderColor: T.negative, width: "100%" }}><Unlock size={14} /> Log out</button>
      <div style={{ height: 20 }} />
    </div>
  );
}

function Section({ T, title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontFamily: "'Baloo 2', cursive", fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

// ---------------- ADD/EDIT ITEM MODAL ----------------

function ItemModal({ T, item, categories, defaultCategory, onClose, onSave, editingRef }) {
  const [category, setCategory] = useState(item.category || defaultCategory || (categories[0] && categories[0].label) || "");
  const [productName, setProductName] = useState(item.productName || "");
  const [plan, setPlan] = useState(item.plan || "");
  const [duration, setDuration] = useState(item.duration || "");
  const [price, setPrice] = useState(item.price || 0);
  const [unit, setUnit] = useState(item.unit || "");
  const [description, setDescription] = useState(item.description || "");
  const [terms, setTerms] = useState(item.terms || "");
  const [imageUrl, setImageUrl] = useState(item.imageUrl || "");

  const handleSave = () => {
    if (!productName.trim() || !category) return;
    onSave({ id: item.id || uid(), category, productName: productName.trim(), plan: plan.trim(), duration: duration.trim(), price: Number(price) || 0, unit: unit.trim(), description: description.trim(), terms: terms.trim(), imageUrl: imageUrl.trim() });
  };

  return (
    <Modal T={T} title={item.id ? "Edit item" : "New item"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }} onFocus={() => (editingRef.current = true)} onBlur={() => (editingRef.current = false)}>
        <Field T={T} label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle(T)}>
            {categories.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
          </select>
        </Field>
        <Field T={T} label="Product name (groups variants together)">
          <input value={productName} onChange={(e) => setProductName(e.target.value)} style={inputStyle(T)} placeholder="e.g. Netflix" />
        </Field>
        <div style={{ display: "flex", gap: 10 }}>
          <Field T={T} label="Plan (optional)" style={{ flex: 1 }}><input value={plan} onChange={(e) => setPlan(e.target.value)} style={inputStyle(T)} placeholder="Sharing" /></Field>
          <Field T={T} label="Duration" style={{ flex: 1 }}><input value={duration} onChange={(e) => setDuration(e.target.value)} style={inputStyle(T)} placeholder="1 Bulan" /></Field>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Field T={T} label="Price" style={{ flex: 1 }}><input type="number" value={price} onChange={(e) => setPrice(e.target.value)} style={inputStyle(T)} /></Field>
          <Field T={T} label="Unit (optional)" style={{ flex: 1 }}><input value={unit} onChange={(e) => setUnit(e.target.value)} style={inputStyle(T)} placeholder="bulan" /></Field>
        </div>
        <Field T={T} label="Description (shared across variants)"><input value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle(T)} /></Field>
        <Field T={T} label="Image URL (optional, shared)"><input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} style={inputStyle(T)} /></Field>
        <Field T={T} label="Terms & conditions (shared)"><textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} style={{ ...inputStyle(T), resize: "vertical" }} /></Field>
        <button onClick={handleSave} disabled={!productName.trim()} style={{ ...primaryBtnStyle(T), opacity: productName.trim() ? 1 : 0.5 }}>Save</button>
      </div>
    </Modal>
  );
}

// ---------------- shared UI ----------------

function NavBtn({ T, icon, label, active, badge, onClick }) {
  return (
    <button onClick={onClick} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "none", border: "none", cursor: "pointer", color: active ? T.accent : T.inkMuted }}>
      {icon}
      {!!badge && (
        <span
          key={badge}
          style={{ position: "absolute", top: -5, right: -8, background: T.negative, color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 999, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", border: `2px solid ${T.navBg}`, animation: "home-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        >
          {badge}
        </span>
      )}
      <span style={{ fontSize: 10, fontFamily: "'Nunito', sans-serif" }}>{label}</span>
    </button>
  );
}

function Modal({ children, onClose, title, T }) {
  return (
    <div className="home-overlay" style={{ position: "fixed", inset: 0, background: T.overlay, display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div className="home-sheet" onClick={(e) => e.stopPropagation()} style={{ background: T.bg, borderRadius: "24px 24px 0 0", padding: 22, width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontFamily: "'Baloo 2', cursive", fontSize: 18, margin: 0, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={iconBtnStyle(T)}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ T, label, children, style }) {
  return (
    <div style={style}>
      <label style={{ fontSize: 11.5, color: T.inkFaint, display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function inputStyle(T) {
  return { border: `1px solid ${T.cardBorder}`, borderRadius: 12, padding: "10px 12px", background: T.bgElevated, color: T.ink, outline: "none", fontFamily: "'Nunito', sans-serif", width: "100%", fontSize: 16, minWidth: 0, boxSizing: "border-box" };
}
function primaryBtnStyle(T) {
  return { background: T.accent, color: "#fff", border: "none", borderRadius: 12, padding: "12px 16px", fontSize: 14.5, cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 };
}
function ghostBtnStyle(T) {
  return { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13.5, padding: "10px 14px", borderRadius: 12, border: `1.5px dashed ${T.cardBorder}`, background: "transparent", color: T.inkMuted, cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 600 };
}
function iconBtnStyle(T) {
  return { display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 10, border: "none", background: T.card, cursor: "pointer", color: T.inkMuted, flexShrink: 0 };
}
