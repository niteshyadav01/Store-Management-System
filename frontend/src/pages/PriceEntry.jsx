import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { getInward, updatePrice } from "../api/api";
import { formatNum } from "../utils/helpers";

// Display dates as dd-mm-yyyy regardless of the underlying stored format.
function toDDMMYYYY(dateStr) {
  if (!dateStr) return dateStr;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function ColFilter({ values, selected, onChange, formatLabel }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState([]);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef();
  const panelRef = useRef();

  useEffect(() => {
    if (open) setPending(selected);
  }, [open]);

  useEffect(() => {
    function handler(e) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        btnRef.current &&
        !btnRef.current.contains(e.target)
      )
        setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleOpen() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const panelH = Math.min(360, window.innerHeight - 24);
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceRight = window.innerWidth - rect.left;
      const top =
        spaceBelow < panelH
          ? Math.max(12, rect.top - panelH - 6)
          : rect.bottom + 6;
      const left = Math.min(rect.left, Math.max(12, window.innerWidth - 280));
      setPos({ top, left });
    }
    setOpen((v) => !v);
  }

  const unique = [...new Set(values.filter(Boolean))];
  const toNum = (v) => {
    const cleaned = String(v).replace(/[^0-9.\-]/g, "");
    return cleaned === "" || cleaned === "-" ? NaN : parseFloat(cleaned);
  };
  const isNumericCol = unique.every((v) => !isNaN(toNum(v)));

  unique.sort((a, b) =>
    isNumericCol ? toNum(a) - toNum(b) : String(a).localeCompare(String(b)),
  );

  const filtered = unique.filter((v) =>
    String(v).toLowerCase().includes(search.toLowerCase()),
  );
  const allSelected = pending.length === unique.length && unique.length > 0;
  const someSelected = pending.length > 0 && pending.length < unique.length;
  function toggle(val) {
    setPending((prev) =>
      prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val],
    );
  }
  function toggleAll() {
    if (pending.length === unique.length) setPending([]);
    else setPending(unique);
  }
  function handleApply() {
    onChange(pending);
    setOpen(false);
  }
  function handleClear() {
    setPending([]);
    onChange([]);
    setOpen(false);
  }
  const hasChanges =
    JSON.stringify(pending.slice().sort()) !==
    JSON.stringify(selected.slice().sort());

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        style={{
          background: selected.length > 0 ? "var(--teal)" : "none",
          border: "none",
          cursor: "pointer",
          padding: "2px 6px",
          borderRadius: 4,
          fontSize: 10,
          color: selected.length > 0 ? "#fff" : "#8a8270",
          lineHeight: 1,
        }}
        title={
          selected.length > 0 ? `${selected.length} filter(s) active` : "Filter"
        }
      >
        ▼
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "absolute",
              top: pos.top,
              left: pos.left,
              zIndex: 99999,
              background: "#fff",
              border: "1px solid var(--line)",
              borderRadius: 10,
              boxShadow: "0 8px 32px rgba(0,0,0,.18)",
              minWidth: 240,
              maxWidth: 320,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid var(--line)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <input
                autoFocus
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  flex: 1,
                  padding: "7px 10px",
                  fontSize: 13,
                  border: "1.5px solid var(--line)",
                  borderRadius: 6,
                  fontFamily: "Inter, Poppins, sans-serif",
                  outline: "none",
                  background: "#fafaf8",
                  color: "var(--ink)",
                }}
                onFocus={(e) => (e.target.style.borderColor = "var(--teal)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--line)")}
              />
              <button
                onClick={() => setOpen(false)}
                title="Close"
                aria-label="Close filter"
                style={{
                  flexShrink: 0,
                  width: 26,
                  height: 26,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 15,
                  lineHeight: 1,
                  color: "#8a8270",
                  borderRadius: 5,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--paper-dim)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "none")
                }
              >
                ✕
              </button>
            </div>
            <div
              onClick={toggleAll}
              style={{
                padding: "8px 14px",
                borderBottom: "1px solid var(--line)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                background: someSelected
                  ? "#fffbf0"
                  : allSelected
                    ? "var(--teal-light)"
                    : undefined,
              }}
            >
              <input
                type="checkbox"
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                checked={allSelected}
                onChange={toggleAll}
                style={{
                  cursor: "pointer",
                  accentColor: "var(--teal)",
                  width: 14,
                  height: 14,
                }}
                onClick={(e) => e.stopPropagation()}
              />
              <span
                style={{
                  fontSize: 12.5,
                  fontStyle: "italic",
                  color: "var(--text-3)",
                  fontFamily: "Inter, Poppins, sans-serif",
                }}
              >
                {someSelected
                  ? `${pending.length} of ${unique.length} selected`
                  : allSelected
                    ? "All selected"
                    : "(Select all)"}
              </span>
              {pending.length > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 11,
                    background: someSelected ? "var(--amber)" : "var(--teal)",
                    color: "#fff",
                    borderRadius: 10,
                    padding: "1px 7px",
                    fontWeight: 600,
                  }}
                >
                  {pending.length}
                </span>
              )}
            </div>
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {filtered.map((v) => (
                <div
                  key={v}
                  onClick={() => toggle(v)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 14px",
                    cursor: "pointer",
                    fontSize: 13,
                    fontFamily: "Inter, Poppins, sans-serif",
                    background: pending.includes(v)
                      ? "var(--teal-light)"
                      : undefined,
                    transition: "background 100ms",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={pending.includes(v)}
                    onChange={() => toggle(v)}
                    style={{
                      cursor: "pointer",
                      accentColor: "var(--teal)",
                      width: 14,
                      height: 14,
                      flexShrink: 0,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatLabel ? formatLabel(v) : v}
                  </span>
                </div>
              ))}
              {!filtered.length && (
                <div
                  style={{
                    padding: "12px 14px",
                    fontSize: 12.5,
                    color: "var(--text-3)",
                    textAlign: "center",
                  }}
                >
                  No results
                </div>
              )}
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                padding: "10px 12px",
                borderTop: "1px solid var(--line)",
                background: "var(--paper-dim)",
              }}
            >
              <button
                onClick={handleClear}
                style={{
                  flex: 1,
                  fontSize: 12.5,
                  padding: "7px 0",
                  border: "1.5px solid var(--line)",
                  borderRadius: 6,
                  cursor: "pointer",
                  background: "#fff",
                  fontFamily: "Inter, Poppins, sans-serif",
                  color: "var(--ink)",
                }}
              >
                Clear
              </button>
              <button
                onClick={handleApply}
                style={{
                  flex: 2,
                  fontSize: 12.5,
                  padding: "7px 0",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  background: hasChanges ? "var(--teal)" : "var(--paper-dim)",
                  color: hasChanges ? "#fff" : "var(--text-3)",
                  fontFamily: "Inter, Poppins, sans-serif",
                  fontWeight: 600,
                }}
              >
                Apply
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

const itemStyle = {
  display: "flex",
  alignItems: "center",
  padding: "6px 12px",
  fontSize: 12,
  cursor: "pointer",
  userSelect: "none",
  transition: "background .1s",
};

export default function PriceEntry() {
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState("");
  const [prices, setPrices] = useState({});
  const [saved, setSaved] = useState({});
  const [recentPrices, setRecentPrices] = useState([]);
  const [syncSameName, setSyncSameName] = useState(false);

  const [cf, setCf] = useState({
    date: [],
    vendor: [],
    name: [],
    code: [],
    qty: [],
    uom: [],
    price: [],
  });

  const load = useCallback(async () => {
    const data = await getInward();
    setEntries(data);
    const init = {};
    data.forEach((e) => {
      init[e._id] = e.price ?? 0;
    });
    setPrices(init);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const filtered = entries
    .filter(
      (e) =>
        !search ||
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        (e.code || "").toLowerCase().includes(search.toLowerCase()),
    )
    .filter(
      (e) =>
        (!cf.date.length || cf.date.includes(e.date)) &&
        (!cf.vendor.length || cf.vendor.includes(e.vendor)) &&
        (!cf.name.length || cf.name.includes(e.name)) &&
        (!cf.code.length || cf.code.includes(e.code)) &&
        (!cf.qty.length || cf.qty.includes(String(e.qty))) &&
        (!cf.uom.length || cf.uom.includes(e.uom)) &&
        (!cf.price.length || cf.price.includes(String(e.price ?? 0))),
    )
    .sort((a, b) => {
      const aZero = (a.price ?? 0) === 0 ? 0 : 1;
      const bZero = (b.price ?? 0) === 0 ? 0 : 1;
      return aZero - bZero;
    });

  function handleFocus(id) {
    // If the current value is 0, clear it so user can type a fresh number
    if (prices[id] === 0 || prices[id] === "0") {
      setPrices((p) => ({ ...p, [id]: "" }));
    }
  }

  async function handleSave(id) {
    try {
      const priceValue = prices[id] === "" ? 0 : (prices[id] ?? 0);
      const entry = entries.find((e) => e._id === id);

      // Only when the "sync same name" toggle is on do we also update every
      // other entry that shares the same material name (case/whitespace
      // insensitive). Otherwise, just this single row is saved.
      const normName = (entry?.name || "").trim().toLowerCase();
      const matchingIds = syncSameName && normName
        ? entries
            .filter((e) => (e.name || "").trim().toLowerCase() === normName)
            .map((e) => e._id)
        : [id];

      await Promise.all(matchingIds.map((mid) => updatePrice(mid, priceValue)));

      setRecentPrices((prev) =>
        [
          {
            _id: id,
            name: entry?.name || "",
            code: entry?.code || "",
            price: priceValue,
            updatedAt: new Date().toISOString(),
          },
          ...prev,
        ].slice(0, 6),
      );

      setPrices((p) => {
        const next = { ...p };
        matchingIds.forEach((mid) => (next[mid] = priceValue));
        return next;
      });

      setSaved((s) => {
        const next = { ...s };
        matchingIds.forEach((mid) => (next[mid] = true));
        return next;
      });

      await load();

      setTimeout(() => {
        setSaved((s) => {
          const next = { ...s };
          matchingIds.forEach((mid) => (next[mid] = false));
          return next;
        });
      }, 1800);
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <>
      <div className="pagehead">
        <div className="pagehead-text">
          <h2>Price Entry</h2>
          <p>
            Enter or update unit prices for inward entries. Visible to Admin and
            Purchase team only.
          </p>
        </div>
      </div>

      <div className="card">
        <h3>
          Inward entries{" "}
          <span className="pill-count">{filtered.length || 0}</span>
        </h3>
        <div
          className="searchbar"
          style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by material name or code…"
          />
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12.5,
              color: "var(--text-3)",
              cursor: "pointer",
              userSelect: "none",
              whiteSpace: "nowrap",
            }}
            title="When on, saving a price also applies it to every other entry with the same material name"
          >
            <input
              type="checkbox"
              checked={syncSameName}
              onChange={(e) => setSyncSameName(e.target.checked)}
              style={{ cursor: "pointer", accentColor: "var(--teal)", width: 14, height: 14 }}
            />
            Bulk Update
          </label>
        </div>
        <div
          className="tablewrap"
          style={{
            overflowX: "scroll",
            overflowY: "scroll",
            maxHeight: "70vh",
          }}
        >
          <table style={{ minWidth: "1200px" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
              <tr style={{ background: "var(--paper-dim)" }}>
                <th>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    Date{" "}
                    <ColFilter
                      values={entries.map((e) => e.date)}
                      selected={cf.date}
                      onChange={(v) => setCf((f) => ({ ...f, date: v }))}
                      formatLabel={toDDMMYYYY}
                    />
                  </span>
                </th>
                <th>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    Vendor{" "}
                    <ColFilter
                      values={entries.map((e) => e.vendor)}
                      selected={cf.vendor}
                      onChange={(v) => setCf((f) => ({ ...f, vendor: v }))}
                    />
                  </span>
                </th>
                <th>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    Material{" "}
                    <ColFilter
                      values={entries.map((e) => e.name)}
                      selected={cf.name}
                      onChange={(v) => setCf((f) => ({ ...f, name: v }))}
                    />
                  </span>
                </th>
                <th>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    Code{" "}
                    <ColFilter
                      values={entries.map((e) => e.code)}
                      selected={cf.code}
                      onChange={(v) => setCf((f) => ({ ...f, code: v }))}
                    />
                  </span>
                </th>
                <th className="num">
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    Qty{" "}
                    <ColFilter
                      values={entries.map((e) => String(e.qty))}
                      selected={cf.qty}
                      onChange={(v) => setCf((f) => ({ ...f, qty: v }))}
                    />
                  </span>
                </th>
                <th>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    UOM{" "}
                    <ColFilter
                      values={entries.map((e) => e.uom)}
                      selected={cf.uom}
                      onChange={(v) => setCf((f) => ({ ...f, uom: v }))}
                    />
                  </span>
                </th>
                <th className="num">
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    Unit price{" "}
                    <ColFilter
                      values={entries.map((e) => String(e.price ?? 0))}
                      selected={cf.price}
                      onChange={(v) => setCf((f) => ({ ...f, price: v }))}
                    />
                  </span>
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const isZero = (e.price ?? 0) === 0;
                return (
                  <tr
                    key={e._id}
                    style={
                      isZero ? { background: "var(--red-light)" } : undefined
                    }
                  >
                    <td>{toDDMMYYYY(e.date)}</td>
                    <td>
                      {e.vendor || (
                        <span style={{ color: "var(--text-3)" }}>—</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 500 }}>{e.name}</td>
                    <td className="mono">{e.code}</td>
                    <td className="num">{formatNum(e.qty)}</td>
                    <td>{e.uom}</td>
                    <td className="num pricecell">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={prices[e._id] ?? 0}
                        onFocus={() => handleFocus(e._id)}
                        onChange={(ev) =>
                          setPrices((p) => ({
                            ...p,
                            [e._id]:
                              ev.target.value === ""
                                ? ""
                                : parseFloat(ev.target.value),
                          }))
                        }
                        placeholder="0.00"
                      />
                    </td>
                    <td>
                      <button
                        className={`btn btn-sm ${saved[e._id] ? "btn-ghost" : "btn-in"}`}
                        onClick={() => handleSave(e._id)}
                      >
                        {saved[e._id] ? "✓ Saved" : "Save"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!entries.length && (
          <div className="empty">
            No inward entries yet.<p>Add inward entries first to set prices.</p>
          </div>
        )}
        {entries.length > 0 && !filtered.length && (
          <div className="empty">No entries match your filter.</div>
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3>Recently updated prices</h3>
        {recentPrices.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {recentPrices.map((item) => (
              <div
                key={item._id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 12px",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  background: "var(--paper-dim)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: "var(--ink)" }}>
                    {item.name || "Unnamed item"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                    {item.code || "—"}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, color: "var(--teal)" }}>
                    {formatNum(item.price)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {new Date(item.updatedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            No recent price updates yet. Save a price to see it here.
          </div>
        )}
      </div>
    </>
  );
}