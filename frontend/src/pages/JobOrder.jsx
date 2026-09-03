import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { todayStr } from "../utils/helpers";

// ── API helpers (add these to your api.js too) ────────────────────────────────
const API = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/+$/, "")}/api`
  : "/api";
async function apiGet(path) {
  const token = localStorage.getItem("sy_token");
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let errMsg = res.statusText;
    try {
      errMsg = (await res.json()).error || errMsg;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(errMsg);
  }
  return res.json();
}
async function apiDelete(path) {
  const token = localStorage.getItem("sy_token");
  const res = await fetch(`${API}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let errMsg = res.statusText;
    try {
      errMsg = (await res.json()).error || errMsg;
    } catch {
      /* non-JSON error body */
    }
    console.error(`[apiDelete] ${path} -> ${res.status}`, errMsg);
    throw new Error(errMsg);
  }
  // DELETE responses often have no body
  try {
    return await res.json();
  } catch {
    return null;
  }
}
async function apiPost(path, body) {
  const token = localStorage.getItem("sy_token");
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let errMsg = res.statusText;
    try {
      errMsg = (await res.json()).error || errMsg;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(errMsg);
  }
  return res.json();
}
async function apiPatch(path, body) {
  const token = localStorage.getItem("sy_token");
  const res = await fetch(`${API}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let errMsg = res.statusText;
    try {
      errMsg = (await res.json()).error || errMsg;
    } catch {
      /* non-JSON error body */
    }
    // Surface enough info in the console to debug without opening devtools Network tab
    console.error(`[apiPatch] ${path} -> ${res.status}`, errMsg);
    throw new Error(errMsg);
  }
  return res.json();
}

// Item shape:
//   description, weightPerPc, perimeter, length, area (auto), qty, unit,
//   process (dropdown, was "finish"), processOther, ralCode, projectName, remark
const emptyItem = () => ({
  _key: Math.random().toString(36).slice(2),
  description: "",
  weightPerPc: "",
  perimeter: "",
  length: "",
  qty: "",
  unit: "NOS",
  process: "",
  processOther: "", // typed value when process === OTHER_PROCESS
  ralCode: "",
  projectName: "",
  remark: "",
});

const CREATE_ROLES = ["admin", "store_manager", "store", "purchase"];


const LOCATIONS = ["Factory", "Site"];
const UNITS = ["NOS", "MTR", "KG", "SET", "PKT", "BOX", "LTR"];
const PROCESS_OPTIONS = ["Powder Coating", "Galvanized", "Hot-Dip"];
const OTHER_PROCESS = "__other_process__";

const VENDORS = [
  {
    name: "Navdurga Electroplating",
    address:
      "Gala No-17, Classical Ind-Estate-02, Khair Pada, Chaudhari Compound-B, Waliv, Vasai(E), Palghar - 401208",
  },
  {
    name: "Aarti Electroplating",
    address:
      "Gala No Q/12, Sector No.46, Sagar IND.EST. Near Quality Hardware, Dhumal Nagar, Waliv village, Vasai road(E)",
  },
  {
    name: "RN Electroplating",
    address:
      "Shop no.7 Sr.no. 106, Maniccha pada, Vasai, Richard compund, Vasai East - 401208",
  },
  {
    name: "C - Tech Electronics",
    address:
      "Shop No 09, Krushi Plaza, Plot no 15, Sector - 19 Apmc, Vashi, Navi Mumbai - 400705",
  },
  {
    name: "Quest Enterprises Pvt Ltd",
    address: "G/140-A, Ansa Industrial Estate, Sakinaka Mumbai 400072",
  },
  {
    name: "Fusion Metal Architects And Innovators",
    address: "Plot No R - 398 MIDC TTC Ind Area, Rabale Navi Mumbai - 400701",
  },
  {
    name: "G.K Powder Coating",
    address:
      "Gala No.09/10 Ground Floor, Indian Corporation Bldg No 200, Gundwawali Road, Bhiwandi, Thane - 421302",
  },
  {
    name: "RAPID INDUSTRIES",
    address:
      "F/5,Nand Jyot Indl. Estate, Safed Pool, Sakinaka, Andheri-East, Mumbai-400072",
  },
  {
    name: "Om Darshan Speciality Surfaces Pvt Ltd.",
    address:
      "Plot no.13, Dewan & Sons Industrial Estate Palghar (W) 401404 Maharashtra",
  },
  {
    name: "META COAT",
    address:
      "Ground Floor, H. No. 666/B, Dive Anjur Road Nr. Sricon RMC Plant, Dive Anjur Bhiwandi 421302 Maharashtra",
  },

];
const OTHER_VENDOR = "__other__";

const COMPANY_LOGO_URL =
  "https://www.profile-solution.com/wp-content/uploads/PS-Logo-1-e1771321686738.png";
const COMPANY_STAMP_URL = "/profile-stamp.png?v=2";
const COMPANY_NAME = "PROFILE DATA CENTER SOLUTIONS PVT. LTD.";
const COMPANY_ADDRESS_SHORT =
  "Office No. 1701, Friends Business Bay, LT Road, Near Veer Savarkar Garden, Borivali (W), Mumbai : 400092";

function sendFromFields(order) {
  return {
    name: String(order?.sendFromName ?? "").trim() || "—",
    address: String(order?.sendFromAddress ?? "").trim() || "—",
  };
}

// Display-only date formatting — dd/mm/yyyy. Accepts a plain 'YYYY-MM-DD'
// string (from the date input) or a full ISO datetime string.
function formatDate(d) {
  if (!d) return "—";
  const datePart = String(d).slice(0, 10);
  const [y, m, day] = datePart.split("-");
  if (!y || !m || !day) return String(d);
  return `${day}/${m}/${y}`;
}

// dd/mm/yyyy, hh:mm AM/PM — used for history timestamps.
function formatDateTime(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  const day = String(dt.getDate()).padStart(2, "0");
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const year = dt.getFullYear();
  let hours = dt.getHours();
  const mins = String(dt.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${day}/${month}/${year}, ${hours}:${mins} ${ampm}`;
}

// Coerce possibly-string numeric fields (e.g. from lean() JSON) safely.
// Used for arithmetic only (pending qty, area preview, etc) — NOT for
// display, since it collapses null/blank down to 0.
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function receivePercent(order) {
  const items = order?.items || [];
  const totalQty = items.reduce((sum, it) => sum + num(it.qty), 0);
  if (totalQty <= 0) return 0;
  const receivedQty = items.reduce((sum, it) => sum + num(it.receivedQty), 0);
  return Math.min(100, Math.round((receivedQty / totalQty) * 100));
}

function statusLabel(order) {
  const status = order?.status || "issued";
  const pct = receivePercent(order);
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return `${label} (${pct}%)`;
}

// Display helper: renders a numeric value that may legitimately be 0,
// distinguishing that from "not entered" (null/undefined/""). Do NOT use
// `it.field || "—"` for numeric display fields — that treats 0 as falsy
// and always prints "—" even when 0 was genuinely saved.
const showNum = (v) => (v === null || v === undefined || v === "" ? "—" : v);

// Area/nos (Sq inch) = Perimeter (mm) × Length (mm) ÷ 645.2
// This is a LIVE PREVIEW only — the backend recomputes this authoritatively
// from perimeter/length on save, so a tampered/stale client value can never
// be trusted or persisted as-is.
const AREA_DIVISOR = 645.2;
function calcArea(perimeter, length) {
  const p = num(perimeter);
  const l = num(length);
  if (!p || !l) return 0;
  return (p * l) / AREA_DIVISOR;
}

// "RAL Code/Finish" column — shows the RAL code only. Process now has its
// own dedicated column, so this used to fall back to repeating the process
// name whenever ralCode was blank, which just duplicated the Process column
// (e.g. "Powder Coating" shown twice in adjacent cells). Simple lookup now.
function ralFinishLabel(it) {
  return it.ralCode && String(it.ralCode).trim() ? it.ralCode : "—";
}

// Chrome does not reliably honor `size` on NAMED @page rules (@page foo {...}
// + page: foo on an element) — it mostly falls back to the browser/OS default
// (Portrait) regardless of what's declared. The one thing Chrome does honor
// consistently is a single UNNAMED `@page { size: ...; }` rule present in the
// document at the moment window.print() runs. So instead of two permanent
// named @page blocks (which can also silently conflict with each other when
// both print templates happen to be mounted at once, e.g. inside ViewModal),
// we inject/update one shared <style> tag with the correct orientation right
// before each print call.
function setPrintPageSize(orientation) {
  const id = "job-order-page-size-style";
  let styleEl = document.getElementById(id);
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = id;
    document.head.appendChild(styleEl);
  }
  const margin = orientation === "landscape" ? "12mm" : "6mm";
  styleEl.textContent = `@page { size: A4 ${orientation}; margin: ${margin}; }`;
}

// ── Delivery Challan Print Template ───────────────────────────────────────────
function PrintChallan({ order }) {
  const ref = useRef();
  const sendFrom = sendFromFields(order);

  function handlePrint() {
    setPrintPageSize("portrait");
    window.print();
  }

  const items = order.items || [];

  return (
    <>
      <style>{PRINT_STYLE}</style>
      <div
        id="job-order-print"
        ref={ref}
        style={{
          fontFamily: "'Helvetica Neue', Arial, sans-serif",
          fontSize: 12,
          color: "#1a1a1a",
          lineHeight: 1.45,
          background: "#fff",
          padding: 16,
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* Header */}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td
                colSpan={2}
                style={{
                  border: "1px solid #000",
                  background: "#f3f1ec",
                  textAlign: "center",
                  padding: "9px 6px",
                  fontWeight: 700,
                  fontSize: 16,
                  letterSpacing: 3,
                }}
              >
                DELIVERY CHALLAN
              </td>
            </tr>
            <tr>
              <td
                style={{
                  width: "35%",
                  border: "1px solid #000",
                  padding: 10,
                  verticalAlign: "middle",
                  textAlign: "center",
                }}
              >
                <img
                  src={COMPANY_LOGO_URL}
                  alt="Profile Solution Logo"
                  style={{
                    width: "100%",
                    height: "auto",
                    maxHeight: 90,
                    objectFit: "contain",
                    display: "block",
                    margin: "0 auto",
                  }}
                />
              </td>
              <td
                style={{
                  border: "1px solid #000",
                  borderLeft: "none",
                  padding: "10px 14px",
                  verticalAlign: "top",
                  fontSize: 14  ,
                  
                }}
              >
                <strong>Profile Data Center Solution Pvt. Ltd. - Head Office address</strong>
                <br />
                {COMPANY_ADDRESS_SHORT}
                <div style={{ height: 10 }} />
                <strong>Profile Data Center Solution Pvt. Ltd. - Factory address</strong>
                <br />
                Profile Data Centre Solutions Pvt. Ltd. Kutal, Dist. Palghar,
                4014
                <br />
                (GST No. 27AALCP0046M1Z5)
              </td>
            </tr>
          </tbody>
        </table>

        {/* Title */}
        <table
          style={{ width: "100%", borderCollapse: "collapse", marginTop: -1 }}
        >
          <tbody>
            
            <tr>
              <td
                style={{
                  border: "1px solid #000",
                  borderTop: "none",
                  padding: "10px 14px",
                  width: "50%",
                  verticalAlign: "top",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#000",
                    marginBottom: 5,
                  }}
                >
                  Send From :
                </div>
                <div
                  style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}
                >
                  {sendFrom.name}
                </div>
                <div style={{ minHeight: 24, color: "#333", marginBottom: 12 }}>
                  {sendFrom.address}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#000",
                    marginBottom: 5,
                  }}
                >
                  Address Of Delivery :
                </div>
                {order.vendorName && (
                  <div
                    style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}
                  >
                    {order.vendorName}
                  </div>
                )}
                <div style={{ minHeight: 40, color: "#333" }}>
                  {order.deliveryAddress || "—"}
                </div>
              </td>
              <td
                style={{
                  border: "1px solid #000",
                  borderTop: "none",
                  borderLeft: "none",
                  padding: "10px 14px",
                  verticalAlign: "top",
                  fontSize: 12,
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    <tr>
                      <td style={{ paddingBottom: 6 }}>
                        <strong>Challan No. :</strong>
                      </td>
                      <td
                        style={{
                          paddingBottom: 6,
                          fontWeight: 700,
                          fontSize: 16,
                          textAlign: "right",
                        }}
                      >
                        {order.srNo || "—"}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ paddingBottom: 6 }}>
                        <strong>Date :</strong>
                      </td>
                      <td style={{ paddingBottom: 6, textAlign: "right" }}>
                        {order.date
                          ? order.date.split("-").reverse().join("/")
                          : "—"}
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <strong>Vehicle No :</strong>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {order.vehicleNo || "—"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Items table — colgroup + table-layout:fixed keeps all 12 columns
            (including RAL Code/Finish, Project Name, Remark which used to run
            off the right edge of the printed/PDF page because unconstrained
            <td>s size themselves to free-text content like Description and
            Remark) inside the A4 portrait printable width. whiteSpace:'normal'
            + wordBreak on every cell makes long text wrap inside its own
            column instead of forcing overflow — same technique already used
            in PrintItemsTable below, just missing here previously. */}
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: -1,
            tableLayout: "fixed",
          }}
        >
          <colgroup>
            <col style={{ width: "4%" }} />   {/* Sr No */}
            <col style={{ width: "16%" }} />  {/* Item Description */}
            <col style={{ width: "9%" }} />   {/* Weight/Pcs */}
            <col style={{ width: "9%" }} />   {/* Perimeter */}
            <col style={{ width: "7%" }} />   {/* Length */}
            <col style={{ width: "8%" }} />   {/* Area/nos */}
            <col style={{ width: "5%" }} />   {/* Qty */}
            <col style={{ width: "6%" }} />   {/* UOM */}
            <col style={{ width: "10%" }} />  {/* Process */}
            <col style={{ width: "10%" }} />  {/* RAL Code/Finish */}
            <col style={{ width: "9%" }} />   {/* Project Name */}
            <col style={{ width: "7%" }} />   {/* Remark */}
          </colgroup>
          <thead>
            <tr style={{ background: "#f3f1ec" }}>
              {[
                "Sr No.",
                "Item Description",
                "Weight/Pcs (Kg)",
                "Perimeter (mm)",
                "Length (mm)",
                "Area/nos (Sq in)",
                "Qty",
                "UOM",
                "Process",
                "RAL Code/Finish",
                "Project Name",
                "Remark",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    border: "1px solid #000",
                    padding: "6px 4px",
                    textAlign: "center",
                    fontSize: 8.5,
                    fontWeight: 700,
                    letterSpacing: "0.01em",
                    textTransform: "uppercase",
                    whiteSpace: "normal",
                    wordBreak: "break-word",
                    lineHeight: 1.2,
                    verticalAlign: "middle",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const cellBase = {
                border: "1px solid #000",
                borderTop: "none",
                padding: "6px 5px",
                whiteSpace: "normal",
                wordBreak: "break-word",
                lineHeight: 1.3,
                verticalAlign: "top",
              };
              return (
                <tr key={i}>
                  <td style={{ ...cellBase, textAlign: "center" }}>{i + 1}</td>
                  <td style={cellBase}>{it.description}</td>
                  <td style={{ ...cellBase, textAlign: "center" }}>
                    {showNum(it.weightPerPc)}
                  </td>
                  <td style={{ ...cellBase, textAlign: "center" }}>
                    {showNum(it.perimeter)}
                  </td>
                  <td style={{ ...cellBase, textAlign: "center" }}>
                    {showNum(it.length)}
                  </td>
                  <td style={{ ...cellBase, textAlign: "center" }}>
                    {it.area !== null && it.area !== undefined
                      ? Number(it.area).toFixed(2)
                      : "—"}
                  </td>
                  <td style={{ ...cellBase, textAlign: "center" }}>
                    {it.qty}
                  </td>
                  <td style={{ ...cellBase, textAlign: "center" }}>
                    {it.unit}
                  </td>
                  <td style={{ ...cellBase, textAlign: "center" }}>
                    {it.process || "—"}
                  </td>
                  <td style={{ ...cellBase, textAlign: "center" }}>
                    {ralFinishLabel(it)}
                  </td>
                  <td style={{ ...cellBase, textAlign: "center" }}>
                    {it.projectName || "—"}
                  </td>
                  <td style={cellBase}>{it.remark || "—"}</td>
                </tr>
              );
            })}
            {/* Empty rows for spacing */}
            {Array.from({ length: Math.max(0, 5 - items.length) }).map(
              (_, i) => (
                <tr key={`empty-${i}`}>
                  {Array.from({ length: 12 }).map((_, j) => (
                    <td
                      key={j}
                      style={{
                        border: "1px solid #000",
                        borderTop: "none",
                        padding: "13px 6px",
                      }}
                    >
                      &nbsp;
                    </td>
                  ))}
                </tr>
              ),
            )}
          </tbody>
        </table>

        {/* Footer */}
        <table
          style={{ width: "100%", borderCollapse: "collapse", marginTop: -1 }}
        >
          <tbody>
            <tr>
              <td
                style={{
                  border: "1px solid #000",
                  borderTop: "none",
                  padding: "12px 14px",
                  width: "60%",
                  verticalAlign: "top",
                }}
              >
                {/* Prepared By is auto-filled from the order's "Issued By"
                    field. Checked By is intentionally left blank — it's
                    filled in by hand after printing, not derived from any
                    stored field. */}
                <div style={{ marginBottom: 50 }}>
                  <strong>Prepared By Name &amp; Signature :</strong>{" "}
                  {order.issuedBy || " ___________________"}
                </div>
                <div>
                  <strong>Checked By Name &amp; Signature :</strong>{" "}
                  ___________________
                </div>
              </td>
              <td
                style={{
                  border: "1px solid #000",
                  borderTop: "none",
                  borderLeft: "none",
                  padding: "5px 15px",
                  textAlign: "center",
                  verticalAlign: "bottom",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    marginBottom: 8,
                    letterSpacing: "0.02em",
                  }}
                >
                  FOR PROFILE SOLUTION
                </div>
                <img
                  src={COMPANY_STAMP_URL}
                  alt="Profile Data Center Solutions stamp"
                  style={{
                    display: "block",
                    margin: "0 auto 0px",
                    width: 90,
                    height: 90,
                    objectFit: "contain",
                  }}
                />
                <div
                  style={{
                    borderTop: "1px solid #000",
                    paddingTop: 6,
                    fontSize: 11,
                    color: "#444",
                  }}
                >
                  Authorized Signatory
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Print button — hidden during print */}
      <div style={{ textAlign: "center", marginTop: 20 }} className="no-print">
        <button
          onClick={handlePrint}
          style={{
            background: "var(--teal)",
            color: "#fff",
            border: "none",
            padding: "10px 28px",
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            fontFamily: "Poppins, sans-serif",
          }}
        >
          🖨 Print Delivery Challan
        </button>
      </div>
    </>
  );
}

// ── Delivery Challan Print Style ──────────────────────────────────────────────
// #job-order-print is the DELIVERY CHALLAN (PrintChallan above) — portrait,
// since it's a single-column narrow document (logo box + address + a modest
// items table), same as a standard invoice/challan layout.
// Orientation itself is set dynamically by setPrintPageSize('portrait') right
// before window.print() — Chrome does not reliably honor `size` on NAMED
// @page rules, so we don't declare one here (see setPrintPageSize above).
const PRINT_STYLE = `
  @media print {
    body * {
      visibility: hidden !important;
    }

    #job-order-print,
    #job-order-print * {
      visibility: visible !important;
    }

    #job-order-print {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      background: #fff !important;
      z-index: 99999 !important;
      padding: 10px !important;
    }
  }
`;

// ── Receiving Receipt / Items-only Print Style ────────────────────────────────
// #job-order-items-print is the RECEIVING RECEIPT (PrintItemsTable below) —
// landscape, since it's a wide, many-column table that needs the extra
// horizontal room.
// Orientation set dynamically by setPrintPageSize('landscape') — see note above.
const ITEMS_PRINT_STYLE = `
  @media print {
    body.print-items-only #job-order-print {
      display: none !important;
    }

    body.print-items-only #job-order-items-print {
      visibility: visible !important;
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      background: #fff !important;
      z-index: 99999 !important;
      padding: 0 !important;
    }

    body.print-items-only #job-order-items-print * {
      visibility: visible !important;
    }
  }
`;

function PrintItemsTable({ order }) {
  const items = order.items || [];
  return (
    <>
      <style>{ITEMS_PRINT_STYLE}</style>
      <div
        id="job-order-items-print"
        style={{
          fontFamily: "'Helvetica Neue', Arial, sans-serif",
          fontSize: 11,
          color: "#1a1a1a",
          lineHeight: 1.4,
          background: "#fff",
          padding: 18,
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* Branded header — just two boxes: logo, and document title */}
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
          }}
        >
          <tbody>
            <tr>
              <td
                style={{
                  width: 160,
                  border: "1px solid #000",
                  padding: 6,
                  verticalAlign: "middle",
                  textAlign: "center",
                }}
              >
                <img
                  src={COMPANY_LOGO_URL}
                  alt="Profile Solution Logo"
                  style={{
                    width: "100%",
                    height: "auto",
                    maxHeight: 64,
                    objectFit: "contain",
                    display: "block",
                    margin: "0 auto",
                  }}
                />
              </td>
              <td
                style={{
                  border: "1px solid #000",
                  borderLeft: "none",
                  padding: "8px 14px",
                  textAlign: "center",
                  verticalAlign: "middle",
                  background: "#f3f1ec",
                }}
              >
                <div
                  style={{ fontWeight: 700, fontSize: 18, letterSpacing: 2 }}
                >
                  RECEIVING RECEIPT
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Meta info */}
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",

            fontSize: 11,
          }}
        >
          <tbody>
            <tr>
              <td
                style={{
                  border: "1px solid #000",
                  padding: "5px 10px",
                  fontWeight: 700,
                  background: "#f3f1ec",
                  width: "10%",
                }}
              >
                Challan No
              </td>
              <td
                style={{
                  border: "1px solid #000",
                  padding: "5px 10px",
                  width: "20%",
                }}
              >
                {order.srNo || "—"}
              </td>
              <td
                style={{
                  border: "1px solid #000",
                  padding: "5px 10px",
                  fontWeight: 700,
                  background: "#f3f1ec",
                  width: "10%",
                }}
              >
                Date
              </td>
              <td
                style={{
                  border: "1px solid #000",
                  padding: "5px 10px",
                  width: "17%",
                }}
              >
                {formatDate(order.date)}
              </td>
              <td
                style={{
                  border: "1px solid #000",
                  padding: "5px 10px",
                  fontWeight: 700,
                  background: "#f3f1ec",
                  width: "13%",
                }}
              >
                Vendor
              </td>
              <td
                style={{
                  border: "1px solid #000",
                  padding: "5px 10px",
                  width: "30%",
                }}
              >
                {order.vendorName || "—"}
              </td>
            </tr>
            <tr>
              <td
                style={{
                  border: "1px solid #000",
                  padding: "5px 10px",
                  fontWeight: 700,
                  background: "#f3f1ec",
                }}
              >
                Vehicle No
              </td>
              <td style={{ border: "1px solid #000", padding: "5px 10px" }}>
                {order.vehicleNo || "—"}
              </td>
              <td
                style={{
                  border: "1px solid #000",
                  padding: "5px 10px",
                  fontWeight: 700,
                  background: "#f3f1ec",
                }}
              >
                Receving Challan No 
              </td>
              <td style={{ border: "1px solid #000", padding: "5px 10px" }}>
                {order.challanNo || "—"}
              </td>
              <td
                style={{
                  border: "1px solid #000",
                  padding: "5px 10px",
                  fontWeight: 700,
                  background: "#f3f1ec",
                }}
              >
                Status
              </td>
              <td
                style={{
                  border: "1px solid #000",
                  padding: "5px 10px",
                  textTransform: "capitalize",
                }}
              >
                {statusLabel(order)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Items table — colgroup widths keep every column on the page.
            tableLayout:'fixed' makes each <col> width authoritative, but by
            default overflowing text still spills visibly into the next cell
            instead of wrapping — that's what caused the header/cell text to
            overlap. Forcing whiteSpace:'normal' + wordBreak + a fixed cell
            padding/line-height on every th/td stops that overflow and lets
            long labels ("Received (where)") wrap onto a second line inside
            their own column instead. */}
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
          }}
        >
          <colgroup>
            <col style={{ width: "2.5%" }} />  {/* Sr */}
            <col style={{ width: "12%" }} />   {/* Item Description */}
            <col style={{ width: "6%" }} />    {/* Weight/Pcs */}
            <col style={{ width: "6%" }} />    {/* Perimeter */}
            <col style={{ width: "6%" }} />    {/* Length */}
            <col style={{ width: "7%" }} />    {/* Area/nos */}
            <col style={{ width: "5.5%" }} />  {/* Outward */}
            <col style={{ width: "11%" }} />   {/* Received (where) */}
            <col style={{ width: "5.5%" }} />  {/* Pending */}
            <col style={{ width: "5.5%" }} />  {/* UOM */}
            <col style={{ width: "7%" }} />    {/* Process */}
            <col style={{ width: "9.5%" }} />  {/* RAL Code/Finish */}
            <col style={{ width: "8%" }} />    {/* Project Name */}
            <col style={{ width: "8.5%" }} />  {/* Remark */}
          </colgroup>
          <thead>
            <tr style={{ background: "#f3f1ec" }}>
              {[
                "Sr",
                "Item Description",
                "Wt/Pcs (Kg)",
                "Perimeter (mm)",
                "Length (mm)",
                "Area/nos (Sq in)",
                "Outward",
                "Received (where)",
                "Pending",
                "UOM",
                "Process",
                "RAL Code/Finish",
                "Project Name",
                "Remark",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    border: "1px solid #000",
                    padding: "6px 4px",
                    textAlign: "center",
                    fontSize: 8,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0,
                    whiteSpace: "normal",
                    wordBreak: "break-word",
                    lineHeight: 1.25,
                    verticalAlign: "middle",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const received = num(it.receivedQty);
              const pending = Math.max(0, num(it.qty) - received);
              const receipts = it.receipts || [];
              const receivedWhere = receipts.length
                ? receipts.map((r) => `${r.qty} @ ${r.location}`).join(", ")
                : "—";
              const cellBase = {
                border: "1px solid #000",
                padding: "5px 5px",
                whiteSpace: "normal",
                wordBreak: "break-word",
                lineHeight: 1.3,
                verticalAlign: "top",
              };
              return (
                <tr key={i}>
                  <td style={{ ...cellBase, textAlign: "center" }}>{i + 1}</td>
                  <td style={cellBase}>{it.description}</td>
                  <td style={{ ...cellBase, textAlign: "center" }}>
                    {showNum(it.weightPerPc)}
                  </td>
                  <td style={{ ...cellBase, textAlign: "center" }}>
                    {showNum(it.perimeter)}
                  </td>
                  <td style={{ ...cellBase, textAlign: "center" }}>
                    {showNum(it.length)}
                  </td>
                  <td style={{ ...cellBase, textAlign: "center" }}>
                    {it.area !== null && it.area !== undefined
                      ? Number(it.area).toFixed(2)
                      : "—"}
                  </td>
                  <td style={{ ...cellBase, textAlign: "center" }}>{it.qty}</td>
                  <td style={{ ...cellBase, fontSize: 9 }}>{receivedWhere}</td>
                  <td
                    style={{
                      ...cellBase,
                      textAlign: "center",
                      fontWeight: pending > 0 ? 700 : 400,
                    }}
                  >
                    {pending}
                  </td>
                  <td style={{ ...cellBase, textAlign: "center" }}>
                    {it.unit}
                  </td>
                  <td style={{ ...cellBase, textAlign: "center" }}>
                    {it.process || "—"}
                  </td>
                  <td style={{ ...cellBase, textAlign: "center", fontSize: 9 }}>
                    {ralFinishLabel(it)}
                  </td>
                  <td style={{ ...cellBase, textAlign: "center" }}>
                    {it.projectName || "—"}
                  </td>
                  <td style={cellBase}>{it.remark || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Footer */}
        <div
          style={{
            marginTop: 14,
            display: "flex",
            justifyContent: "space-between",
            fontSize: 9.5,
            color: "#555",
          }}
        >
          <div>Generated on {formatDateTime(new Date().toISOString())}</div>
          <div style={{ fontWeight: 700 }}>{COMPANY_NAME}</div>
        </div>
      </div>
    </>
  );
}

// Given a saved process string, figures out how to prefill the edit form's
// process <select> + "other" text field: exact match against the presets ->
// select it; any other non-empty value -> select "Other" and preload the
// typed field with it; blank -> nothing selected.
function deriveProcessFields(savedProcess) {
  const val = String(savedProcess || "").trim();
  if (!val) return { process: "", processOther: "" };
  if (PROCESS_OPTIONS.includes(val)) return { process: val, processOther: "" };
  return { process: OTHER_PROCESS, processOther: val };
}

// ── Shared item-row field renderer ─────────────────────────────────────────
// Used by both the create form and EditModal so the mobile fix (stacked,
// individually-labelled fields) only has to live in one place. Every field
// gets its own <label> — hidden via CSS on desktop (where the shared
// .jo-item-header row above the rows already provides column labels) and
// shown on mobile (where that header row is hidden and rows stack to a
// single column, so each input needs its own label to stay legible).
function ItemRow({ it, idx, updateItem, removeItem, handleProcessSelect, disableRemove }) {
  const area = calcArea(it.perimeter, it.length);
  return (
    <div className="jo-item-row">
      <div className="field">
        <label>Item Description</label>
        <input
          value={it.description}
          onChange={(e) => updateItem(it._key, { description: e.target.value })}
          placeholder={`Item ${idx + 1} description`}
        />
      </div>
      <div className="field">
        <label>Weight/Pcs (Kg)</label>
        <input
          type="number"
          min="0"
          step="any"
          value={it.weightPerPc}
          onChange={(e) => updateItem(it._key, { weightPerPc: e.target.value })}
          placeholder="0.00"
        />
      </div>
      <div className="field">
        <label>Perimeter (mm)</label>
        <input
          type="number"
          min="0"
          step="any"
          value={it.perimeter}
          onChange={(e) => updateItem(it._key, { perimeter: e.target.value })}
          placeholder="0"
        />
      </div>
      <div className="field">
        <label>Length (mm)</label>
        <input
          type="number"
          min="0"
          step="any"
          value={it.length}
          onChange={(e) => updateItem(it._key, { length: e.target.value })}
          placeholder="0"
        />
      </div>
      <div className="field">
        <label>Area/nos (Sq in)</label>
        <input
          value={area ? area.toFixed(2) : ""}
          disabled
          placeholder="Auto"
          title="Perimeter × Length ÷ 645.2 — calculated automatically"
        />
      </div>
      <div className="field">
        <label>Qty</label>
        <input
          type="number"
          min="0"
          step="any"
          value={it.qty}
          onChange={(e) => updateItem(it._key, { qty: e.target.value })}
          placeholder="0"
        />
      </div>
      <div className="field">
        <label>UOM</label>
        <select
          value={it.unit}
          onChange={(e) => updateItem(it._key, { unit: e.target.value })}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Process</label>
        <select
          value={it.process}
          onChange={(e) => handleProcessSelect(it._key, e.target.value)}
        >
          <option value="">Select process…</option>
          {PROCESS_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          <option value={OTHER_PROCESS}>Other (type your own)</option>
        </select>
        {it.process === OTHER_PROCESS && (
          <input
            className="field-other-input"
            value={it.processOther}
            onChange={(e) => updateItem(it._key, { processOther: e.target.value })}
            placeholder="Enter process"
          />
        )}
      </div>
      <div className="field">
        <label>RAL Code/Finish</label>
        <input
          value={it.ralCode}
          onChange={(e) => updateItem(it._key, { ralCode: e.target.value })}
          placeholder="e.g. RAL 9010"
        />
      </div>
      <div className="field">
        <label>
          Project Name <span style={{ color: "var(--red)" }}>*</span>
        </label>
        <input
          value={it.projectName}
          onChange={(e) => updateItem(it._key, { projectName: e.target.value })}
          placeholder="Project name"
        />
      </div>
      <div className="field">
        <label>Remark</label>
        <input
          value={it.remark}
          onChange={(e) => updateItem(it._key, { remark: e.target.value })}
          placeholder="NTT, NAV DC-3…"
        />
      </div>
      <button
        type="button"
        onClick={() => removeItem(it._key)}
        disabled={disableRemove}
        className="jo-item-remove"
      >
        ✕
      </button>
    </div>
  );
}

// ── View Details Modal ────────────────────────────────────────────────────────
function ViewModal({ order, onClose, onEdit }) {
  const [detail, setDetail] = useState(order);

  useEffect(() => {
    setDetail(order);
    if (!order?._id) return;
    let cancelled = false;
    (async () => {
      try {
        const full = await apiGet(`/job-orders/${order._id}`);
        if (!cancelled) setDetail(full);
      } catch (err) {
        console.error("[ViewModal] failed to load order details", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Cleans up the body class used to isolate the items-only print output
  // (see handleDownloadItemsPdf below) in case the print dialog is
  // cancelled or closed — 'afterprint' fires either way.
  useEffect(() => {
    const cleanup = () => document.body.classList.remove("print-items-only");
    window.addEventListener("afterprint", cleanup);
    return () => window.removeEventListener("afterprint", cleanup);
  }, []);

  function handleDownloadItemsPdf() {
    setPrintPageSize("landscape");
    document.body.classList.add("print-items-only");
    setTimeout(() => window.print(), 100);
  }

  const sendFrom = sendFromFields(detail);

  return (
    <div className="jo-modal-overlay" onClick={onClose}>
      <div
        className="jo-modal-panel jo-modal-panel--lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="jo-modal-header">
          <div className="jo-modal-header-text">
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              Job Order #{detail.srNo}
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8a8270" }}>
              {formatDate(detail.date)} · {detail.vendorName} ·{" "}
              {detail.vehicleNo || "—"}
            </p>
          </div>
          <div className="jo-modal-actions no-print">
            {onEdit && (
              <button
                onClick={onEdit}
                className="btn btn-ghost btn-sm"
                style={{ whiteSpace: "nowrap" }}
              >
                ✎ Edit
              </button>
            )}
            <button
              type="button"
              className="jo-modal-close"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal body */}
        <div className="jo-modal-body">
          {/* Meta info */}
          <div className="jo-meta-grid">
            {[
              { label: "challan No", value: detail.srNo },
              { label: "Date", value: formatDate(detail.date) },
              { label: "Send From Name", value: sendFrom.name },
              { label: "Send From Address", value: sendFrom.address },
              { label: "Vendor Name", value: detail.vendorName },
              { label: "Vehicle No", value: detail.vehicleNo || "—" },
              { label: "Issued By", value: detail.issuedBy || "—" },
              {
                label: "Delivery Address",
                value: detail.deliveryAddress || "—",
              },
              { label: "Challan No", value: detail.challanNo || "—" },
              { label: "Received At", value: detail.receivedAt || "—" },
              { label: "Received By", value: detail.receivedBy || "—" },
              { label: "Status", value: statusLabel(detail) },
            ].map((f) => (
              <div
                key={f.label}
                style={{
                  background: "var(--paper-dim)",
                  borderRadius: 8,
                  padding: "10px 14px",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#8a8270",
                    marginBottom: 4,
                  }}
                >
                  {f.label}
                </div>
                <div
                  style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}
                >
                  {f.value}
                </div>
              </div>
            ))}
          </div>

          {/* Items table */}
          <div className="jo-items-toolbar">
            <h3
              style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "1px",
                color: "#8a8270",
                margin: 0,
              }}
            >
              Items
            </h3>
            <button
              onClick={handleDownloadItemsPdf}
              className="no-print"
              style={{
                background: "var(--paper-dim)",
                border: "1px solid var(--line)",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 700,
                color: "var(--ink)",
                padding: "5px 10px",
              }}
            >
              ⬇ Download PDF
            </button>
          </div>
          {/* Off-screen mount feeding the items-only print/PDF (see ITEMS_PRINT_STYLE) */}
          <div
            style={{ position: "fixed", top: -99999, left: -99999, zIndex: -1 }}
          >
            <PrintItemsTable order={detail} />
          </div>
          <div className="tablewrap" style={{ marginBottom: 20 }}>
            <table>
              <thead>
                <tr>
                  <th>Sr No</th>
                  <th>Item Description</th>
                  <th className="num">Wt/Pcs (Kg)</th>
                  <th className="num">Perimeter (mm)</th>
                  <th className="num">Length (mm)</th>
                  <th className="num">Area/nos (Sq in)</th>
                  <th className="num">Outward</th>
                  <th>Received (where)</th>
                  <th className="num">Pending</th>
                  <th>UOM</th>
                  <th>Process</th>
                  <th>RAL Code/Finish</th>
                  <th>Project Name</th>
                  <th>Remark</th>
                </tr>
              </thead>
              <tbody>
                {(detail.items || []).map((it, i) => {
                  const received = num(it.receivedQty);
                  const pending = Math.max(0, num(it.qty) - received);
                  const receipts = it.receipts || [];
                  return (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td style={{ fontWeight: 500 }}>{it.description}</td>
                      <td className="num">{showNum(it.weightPerPc)}</td>
                      <td className="num">{showNum(it.perimeter)}</td>
                      <td className="num">{showNum(it.length)}</td>
                      <td className="num">
                        {it.area !== null && it.area !== undefined
                          ? Number(it.area).toFixed(2)
                          : "—"}
                      </td>
                      <td className="num">{it.qty}</td>
                      <td style={{ fontSize: 12 }}>
                        {receipts.length ? (
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                            }}
                          >
                            {receipts.map((r, ri) => (
                              <span
                                key={ri}
                                style={{
                                  color: "var(--teal-dark)",
                                  fontWeight: 600,
                                }}
                              >
                                {r.qty} @ {r.location}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: "#8a8270" }}>—</span>
                        )}
                      </td>
                      <td
                        className="num"
                        style={{
                          color: pending > 0 ? "var(--rust-dark)" : undefined,
                          fontWeight: pending > 0 ? 700 : undefined,
                        }}
                      >
                        {pending}
                      </td>
                      <td>{it.unit}</td>
                      <td>{it.process || "—"}</td>
                      <td>{ralFinishLabel(it)}</td>
                      <td>{it.projectName || "—"}</td>
                      <td>{it.remark || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Transaction history */}
          {detail.history?.length > 0 && (
            <>
              <h3
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  color: "#8a8270",
                  marginBottom: 10,
                }}
              >
                Transaction History
              </h3>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginBottom: 20,
                }}
              >
                {detail.history.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "8px 14px",
                      background: "var(--paper-dim)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: 10,
                        padding: "2px 8px",
                        borderRadius: 10,
                        background:
                          h.action === "issued"
                            ? "#e6f2f0"
                            : h.action === "received"
                              ? "#eef2ff"
                              : "#f8ede7",
                        color:
                          h.action === "issued"
                            ? "var(--teal-dark)"
                            : h.action === "received"
                              ? "#3730a3"
                              : "var(--rust-dark)",
                        textTransform: "uppercase",
                      }}
                    >
                      {h.action}
                    </span>
                    <span style={{ color: "var(--ink)" }}>{h.note || "—"}</span>
                    <span style={{ marginLeft: "auto", color: "#8a8270" }}>
                      {h.by} · {formatDateTime(h.at)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Print challan */}
          <h3
            style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "1px",
              color: "#8a8270",
              marginBottom: 10,
            }}
          >
            Delivery Challan
          </h3>
          <PrintChallan order={detail} />
        </div>
      </div>
    </div>
  );
}

function ReceiveModal({ order, onSave, onClose }) {
  const { user } = useAuth();
  const [receivedBy, setReceivedBy] = useState("");
  const [challanNo, setChallanNo] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // qtyInputs[i]      = qty being received NOW for item i, defaulted to the remaining (pending) qty.
  // locationInputs[i] = location this item's qty is being received at (only matters when qty > 0).
  const [qtyInputs, setQtyInputs] = useState(() =>
    (order.items || []).map((it) =>
      Math.max(0, num(it.qty) - num(it.receivedQty)),
    ),
  );
  const [locationInputs, setLocationInputs] = useState(() =>
    (order.items || []).map(() => LOCATIONS[0]),
  );

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function setQty(i, rawVal) {
    // Clamp live so the qty received can never exceed what's actually pending
    // for that item (order qty minus whatever's already been received).
    const it = order.items[i];
    const remaining = Math.max(0, num(it.qty) - num(it.receivedQty));

    let clamped = rawVal;
    if (rawVal !== "") {
      const n = num(rawVal);
      if (n < 0) clamped = "0";
      else if (n > remaining) clamped = String(remaining);
      else clamped = rawVal; // keep as typed (preserves things like "12." mid-entry)
    }
    setQtyInputs((list) => list.map((v, idx) => (idx === i ? clamped : v)));
  }
  function setItemLocation(i, val) {
    setLocationInputs((list) => list.map((v, idx) => (idx === i ? val : v)));
  }

  async function handleSave(e) {
    e.preventDefault();
    setErr("");
    if (!receivedBy.trim()) {
      setErr("Please enter who received the goods.");
      return;
    }

    const itemsPayload = [];
    let anyReceiving = false;
    for (let i = 0; i < order.items.length; i++) {
      const it = order.items[i];
      const already = num(it.receivedQty);
      const remaining = Math.max(0, num(it.qty) - already);
      const receiving = num(qtyInputs[i]);

      if (receiving < 0) {
        setErr(`"${it.description}": quantity can't be negative.`);
        return;
      }
      if (receiving > remaining + 0.0001) {
        setErr(
          `"${it.description}": received qty (${receiving}) can't exceed ordered qty. Only ${remaining} of ${num(it.qty)} is still pending.`,
        );
        return;
      }
      if (receiving > 0) {
        anyReceiving = true;
        if (!locationInputs[i]) {
          setErr(`Choose a location for "${it.description}".`);
          return;
        }
      }
      itemsPayload.push({ receiving, location: locationInputs[i] });
    }
    if (!anyReceiving) {
      setErr(
        "Enter a received quantity for at least one item — you can receive part of the order now and the rest later.",
      );
      return;
    }

    setSaving(true);
    try {
      const payload = { items: itemsPayload, receivedBy, challanNo, note };
      console.log(
        "[ReceiveModal] submitting receive payload",
        order._id,
        payload,
      ); // remove once confirmed working
      await onSave(payload);
    } catch (e) {
      console.error("[ReceiveModal] receive failed", e);
      setErr(e.message || "Something went wrong while saving.");
      setSaving(false);
    }
  }

  return (
    <div className="jo-modal-overlay jo-modal-overlay--high" onClick={onClose}>
      <div
        className="jo-modal-panel jo-modal-panel--md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jo-modal-header">
          <div className="jo-modal-header-text">
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
              Mark as Received — #{order.srNo}
            </h2>
          </div>
          <button
            type="button"
            className="jo-modal-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <form
          onSubmit={handleSave}
          className="jo-modal-form"
        >
          <div className="jo-modal-body">
            <div className="jo-receive-hint">
              Items — enter qty received now, and where. Leave less than the
              full amount to receive the rest later.
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginBottom: 20,
              }}
            >
              {order.items.map((it, i) => {
                const already = num(it.receivedQty);
                const remaining = Math.max(0, num(it.qty) - already);
                const receiving = num(qtyInputs[i]);
                return (
                  <div key={i} className="jo-receive-row">
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {it.description}
                      </div>
                      <div style={{ fontSize: 11, color: "#8a8270" }}>
                        Outward {it.qty} {it.unit}
                        {it.perimeter != null && it.length != null
                          ? ` · ${it.perimeter}×${it.length}mm`
                          : ""}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "#8a8270" }}>
                      Already:{" "}
                      <strong style={{ color: "var(--ink)" }}>{already}</strong>
                    </div>
                    <div style={{ fontSize: 12, color: "#8a8270" }}>
                      Pending:{" "}
                      <strong
                        style={{
                          color:
                            remaining > 0
                              ? "var(--rust-dark)"
                              : "var(--teal-dark)",
                        }}
                      >
                        {remaining}
                      </strong>
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="jo-mobile-only-label">Qty received</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        max={remaining}
                        value={qtyInputs[i]}
                        onChange={(e) => setQty(i, e.target.value)}
                        disabled={remaining <= 0}
                        placeholder="0"
                      />
                    </div>
                    <div className="field" style={{ margin: 0 }}>
                      <label className="jo-mobile-only-label">Location</label>
                      <select
                        value={locationInputs[i]}
                        onChange={(e) => setItemLocation(i, e.target.value)}
                        disabled={remaining <= 0 || receiving <= 0}
                      >
                        {LOCATIONS.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="formgrid">
              <div className="field full">
                <label>
                  Received by <span style={{ color: "var(--red)" }}>*</span>
                </label>
                <input
                  value={receivedBy}
                  onChange={(e) => setReceivedBy(e.target.value)}
                  placeholder="Name of person receiving"
                />
              </div>
              <div className="field full">
                <label>
                  Receving Challan No <span style={{ color: "red" }}>*</span>
                </label>
                <input
                  value={challanNo}
                  onChange={(e) => setChallanNo(e.target.value)}
                  placeholder="Vendor's delivery challan no."
                  required
                />
              </div>
            </div>
            {err && (
              <div className="alert err" style={{ marginTop: 12 }}>
                {err}
              </div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              padding: "14px 24px",
              borderTop: "1px solid var(--line)",
              background: "var(--paper-dim)",
              flexShrink: 0,
            }}
          >
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-in" disabled={saving}>
              {saving ? "Saving…" : "Confirm received"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit Modal ──────────────────────────────────────────────────────────────
// Header fields are always editable. Items are only editable while the order
// is still 'issued' — once receiving has started, receivedQty/receipts are
// tied to each item's position in the array, so structural item edits (add,
// remove, reorder) would corrupt that tracking. The backend enforces this
// too (see PATCH /:id); this UI just avoids offering something that will be
// rejected.
function EditModal({ order, onSave, onClose }) {
  const itemsLocked = order.status !== "issued";

  const [srNo, setSrNo] = useState(order.srNo || "");
  const [date, setDate] = useState((order.date || "").slice(0, 10) || todayStr());
  const [sendFromName, setSendFromName] = useState(order.sendFromName || "");
  const [sendFromAddress, setSendFromAddress] = useState(order.sendFromAddress || "");
  const [vendorName, setVendorName] = useState(order.vendorName || "");
  const [vendorCustom, setVendorCustom] = useState(
    () => !!order.vendorName && !VENDORS.some((v) => v.name === order.vendorName),
  );
  const [vehicleNo, setVehicleNo] = useState(order.vehicleNo || "");
  const [issuedBy, setIssuedBy] = useState(order.issuedBy || "");
  const [deliveryAddress, setDeliveryAddress] = useState(order.deliveryAddress || "");

  const [items, setItems] = useState(() =>
    (order.items || []).map((it) => {
      const { process, processOther } = deriveProcessFields(it.process);
      return {
        _key: Math.random().toString(36).slice(2),
        description: it.description || "",
        weightPerPc: it.weightPerPc != null ? String(it.weightPerPc) : "",
        perimeter: it.perimeter != null ? String(it.perimeter) : "",
        length: it.length != null ? String(it.length) : "",
        qty: it.qty != null ? String(it.qty) : "",
        unit: it.unit || "NOS",
        process,
        processOther,
        ralCode: it.ralCode || "",
        projectName: it.projectName || "",
        remark: it.remark || "",
      };
    }),
  );

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setSrNo(order.srNo || "");
    setDate((order.date || "").slice(0, 10) || todayStr());
    setSendFromName(order.sendFromName || "");
    setSendFromAddress(order.sendFromAddress || "");
    setVendorName(order.vendorName || "");
    setVendorCustom(
      !!order.vendorName && !VENDORS.some((v) => v.name === order.vendorName),
    );
    setVehicleNo(order.vehicleNo || "");
    setIssuedBy(order.issuedBy || "");
    setDeliveryAddress(order.deliveryAddress || "");
  }, [order]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function updateItem(key, patch) {
    setItems((list) =>
      list.map((it) => (it._key === key ? { ...it, ...patch } : it)),
    );
  }
  function addItem() {
    setItems((list) => [...list, emptyItem()]);
  }
  function removeItem(key) {
    setItems((list) =>
      list.length > 1 ? list.filter((it) => it._key !== key) : list,
    );
  }
  function handleProcessSelect(key, val) {
    if (val === OTHER_PROCESS) updateItem(key, { process: OTHER_PROCESS });
    else updateItem(key, { process: val, processOther: "" });
  }

  async function handleSave(e) {
    e.preventDefault();
    setErr("");

    if (!srNo.trim()) return setErr("SR No is required.");
    if (!vendorName.trim()) return setErr("Vendor name is required.");
    if (!issuedBy.trim()) return setErr("Issued By is required.");

    const payload = {
      srNo: srNo.trim(),
      date,
      sendFromName: sendFromName.trim(),
      sendFromAddress: sendFromAddress.trim(),
      vendorName: vendorName.trim(),
      vehicleNo,
      issuedBy: issuedBy.trim(),
      deliveryAddress,
    };

    if (!itemsLocked) {
      const touchedItems = items.filter(
        (it) =>
          it.description.trim() ||
          it.qty ||
          it.projectName.trim() ||
          it.weightPerPc ||
          it.perimeter ||
          it.length ||
          it.process ||
          it.ralCode.trim() ||
          it.remark.trim(),
      );
      if (!touchedItems.length)
        return setErr("Add at least one item with description, qty, and project name.");

      const invalidItem = touchedItems.find(
        (it) => !it.description.trim() || !it.qty || !it.projectName.trim(),
      );
      if (invalidItem) {
        const missing = [];
        if (!invalidItem.description.trim()) missing.push("description");
        if (!invalidItem.qty) missing.push("qty");
        if (!invalidItem.projectName.trim()) missing.push("project name");
        return setErr(
          `"${invalidItem.description || "An item"}" is missing ${missing.join(", ")}. Fill it in or remove the row before saving.`,
        );
      }

      const missingCustomProcess = touchedItems.find(
        (it) => it.process === OTHER_PROCESS && !it.processOther.trim(),
      );
      if (missingCustomProcess)
        return setErr(
          `Enter a custom process for "${missingCustomProcess.description}", or pick a preset.`,
        );

      payload.items = touchedItems.map(({ processOther, ...it }) => ({
        description: it.description,
        weightPerPc: it.weightPerPc === "" ? null : parseFloat(it.weightPerPc),
        perimeter: it.perimeter === "" ? null : parseFloat(it.perimeter),
        length: it.length === "" ? null : parseFloat(it.length),
        qty: parseFloat(it.qty) || 0,
        unit: it.unit,
        process: it.process === OTHER_PROCESS ? processOther.trim() : it.process,
        ralCode: it.ralCode,
        projectName: it.projectName,
        remark: it.remark,
      }));
    }

    setSaving(true);
    try {
      await onSave(payload);
    } catch (e) {
      console.error("[EditModal] save failed", e);
      setErr(e.message || "Something went wrong while saving.");
      setSaving(false);
    }
  }

  return (
    <div className="jo-modal-overlay jo-modal-overlay--high" onClick={onClose}>
      <div
        className="jo-modal-panel jo-modal-panel--lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="jo-modal-header">
          <div className="jo-modal-header-text">
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
              Edit Job Order — #{order.srNo}
            </h2>
          </div>
          <button
            type="button"
            className="jo-modal-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="jo-modal-form">
          <div className="jo-modal-body">
            {/* Header fields */}
            <div className="formgrid" style={{ marginBottom: 20 }}>
              <div className="field">
                <label>
                  challan No. <span style={{ color: "var(--red)" }}>*</span>
                </label>
                <input value={srNo} onChange={(e) => setSrNo(e.target.value)} />
              </div>
              <div className="field">
                <label>Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Send From Name</label>
                <input
                  value={sendFromName}
                  onChange={(e) => setSendFromName(e.target.value)}
                  placeholder="Enter sender name"
                />
              </div>
              <div className="field">
                <label>Send From Address</label>
                <input
                  value={sendFromAddress}
                  onChange={(e) => setSendFromAddress(e.target.value)}
                  placeholder="Enter sender address"
                />
              </div>
              <div className="field">
                <label>
                  Vendor Name <span style={{ color: "var(--red)" }}>*</span>
                </label>
                {vendorCustom ? (
                  <div className="jo-vendor-custom-row">
                    <input
                      value={vendorName}
                      onChange={(e) => setVendorName(e.target.value)}
                      placeholder="Enter vendor name"
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ whiteSpace: "nowrap" }}
                      onClick={() => setVendorCustom(false)}
                    >
                      ← Back
                    </button>
                  </div>
                ) : (
                  <select
                    value={vendorName}
                    onChange={(e) => {
                      if (e.target.value === "__custom__") {
                        setVendorCustom(true);
                        setVendorName("");
                      } else {
                        setVendorName(e.target.value);
                        const found = VENDORS.find((v) => v.name === e.target.value);
                        if (found) setDeliveryAddress(found.address);
                      }
                    }}
                  >
                    <option value="">— Select vendor —</option>
                    {VENDORS.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                    <option value="__custom__">✎ Add own vendor…</option>
                  </select>
                )}
              </div>
              <div className="field">
                <label>Address of Delivery</label>
                <input
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Vehicle No</label>
                <input
                  value={vehicleNo}
                  onChange={(e) => setVehicleNo(e.target.value)}
                />
              </div>
              <div className="field">
                <label>
                  Issued By <span style={{ color: "var(--red)" }}>*</span>
                </label>
                <input
                  value={issuedBy}
                  onChange={(e) => setIssuedBy(e.target.value)}
                />
              </div>
            </div>

            {/* Items */}
            <div
              style={{
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h4
                style={{
                  margin: 0,
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  color: "#8a8270",
                }}
              >
                Items
              </h4>
              {itemsLocked && (
                <span style={{ fontSize: 11, color: "var(--rust-dark)" }}>
                  🔒 Locked — receiving has started on this order, so items
                  can't be changed here.
                </span>
              )}
            </div>

            {itemsLocked ? (
              <div className="tablewrap" style={{ marginBottom: 16 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Sr No</th>
                      <th>Item Description</th>
                      <th className="num">Qty</th>
                      <th>UOM</th>
                      <th>Process</th>
                      <th>RAL Code</th>
                      <th>Project Name</th>
                      <th>Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(order.items || []).map((it, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{it.description}</td>
                        <td className="num">{it.qty}</td>
                        <td>{it.unit}</td>
                        <td>{it.process || "—"}</td>
                        <td>{it.ralCode || "—"}</td>
                        <td>{it.projectName || "—"}</td>
                        <td>{it.remark || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <>
                {/* Column-header row — desktop only. On mobile the grid
                    collapses to a single stacked column (see .jo-item-row
                    media queries), so this shared header no longer lines up
                    with anything and is hidden via .jo-item-header there;
                    each field gets its own <label> inside ItemRow instead. */}
                <div className="jo-item-header">
                  <span>Item Description</span>
                  <span>Weight/Pcs (Kg)</span>
                  <span>Perimeter (mm)</span>
                  <span>Length (mm)</span>
                  <span>Area/nos (Sq in)</span>
                  <span>Qty</span>
                  <span>UOM</span>
                  <span>Process</span>
                  <span>RAL Code/Finish</span>
                  <span>
                    Project Name <span style={{ color: "var(--red)" }}>*</span>
                  </span>
                  <span>Remark</span>
                  <span></span>
                </div>

                {items.map((it, idx) => (
                  <ItemRow
                    key={it._key}
                    it={it}
                    idx={idx}
                    updateItem={updateItem}
                    removeItem={removeItem}
                    handleProcessSelect={handleProcessSelect}
                    disableRemove={items.length === 1}
                  />
                ))}

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={addItem}
                  style={{ marginBottom: 4 }}
                >
                  + Add item
                </button>
              </>
            )}

            {err && (
              <div className="alert err" style={{ marginTop: 16 }}>
                {err}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              padding: "14px 24px",
              borderTop: "1px solid var(--line)",
              background: "var(--paper-dim)",
              flexShrink: 0,
            }}
          >
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-in" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function JobOrder() {
  const { user } = useAuth();

  const canCreate = CREATE_ROLES.includes(user?.role);
  const isAdmin = user?.role === "admin";
  const [orders, setOrders] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [viewOrder, setViewOrder] = useState(null);
  const [receiveOrder, setReceiveOrder] = useState(null);
  const [editOrder, setEditOrder] = useState(null);
  const [printOrder, setPrintOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: "", ok: true });
  const [statusFilter, setStatusFilter] = useState("all");

  // Form state
  const [srNo, setSrNo] = useState("");
  const [date, setDate] = useState(todayStr());
  const [sendFromName, setSendFromName] = useState("");
  const [sendFromAddress, setSendFromAddress] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [vendorCustom, setVendorCustom] = useState(false);
  const [vehicleNo, setVehicleNo] = useState("");
  const [issuedBy, setIssuedBy] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");

  const [items, setItems] = useState([emptyItem()]);

  function resetFields() {
    setSrNo("");
    setDate(todayStr());
    setSendFromName("");
    setSendFromAddress("");
    setVendorName("");
    setVendorCustom(false);
    setVehicleNo("");
    setIssuedBy(user?.name || "");
    setDeliveryAddress("");
    setItems([emptyItem()]);
  }

  function resetForm() {
    resetFields();
    setShowForm(false);
  }

  const load = useCallback(async () => {
    try {
      const data = await apiGet("/job-orders");
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("[JobOrder] failed to load job orders", err);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Sends the currently-selected order's challan to the browser's print dialog
  // (from which the user can choose "Save as PDF") whenever printOrder is set.
  useEffect(() => {
    if (!printOrder) return;

    setPrintPageSize("portrait"); // this flow always prints the Delivery Challan
    const t = setTimeout(() => window.print(), 150);

    const handleAfterPrint = () => setPrintOrder(null);

    window.addEventListener("afterprint", handleAfterPrint);

    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, [printOrder]);

  function updateItem(key, patch) {
    setItems((list) =>
      list.map((it) => (it._key === key ? { ...it, ...patch } : it)),
    );
  }
  function addItem() {
    setItems((list) => [...list, emptyItem()]);
  }
  function removeItem(key) {
    setItems((list) =>
      list.length > 1 ? list.filter((it) => it._key !== key) : list,
    );
  }

  // Called from the Process <select> in each item row.
  function handleProcessSelect(key, val) {
    if (val === OTHER_PROCESS) {
      updateItem(key, { process: OTHER_PROCESS });
    } else {
      updateItem(key, { process: val, processOther: "" });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg({ text: "", ok: true });
    if (!canCreate) {
      setMsg({
        text: "You don't have permission to create job orders.",
        ok: false,
      });
      return;
    }
    if (!srNo.trim()) {
      setMsg({ text: "SR No is required.", ok: false });
      return;
    }
    if (!vendorName.trim()) {
      setMsg({ text: "Vendor name is required.", ok: false });
      return;
    }
    if (!issuedBy.trim()) {
      setMsg({ text: "Issued By is required.", ok: false });
      return;
    }

    // Any row the user actually started filling in — used to detect rows
    // that were partially filled and would otherwise be silently dropped.
    const touchedItems = items.filter(
      (it) =>
        it.description.trim() ||
        it.qty ||
        it.projectName.trim() ||
        it.weightPerPc ||
        it.perimeter ||
        it.length ||
        it.process ||
        it.ralCode.trim() ||
        it.remark.trim(),
    );
    if (!touchedItems.length) {
      setMsg({
        text: "Add at least one item with description, qty, and project name.",
        ok: false,
      });
      return;
    }

    // Every touched row MUST have description + qty + project name — instead
    // of silently filtering incomplete rows out (which used to make items
    // disappear without any warning), we now block submit and say exactly
    // which row and field is missing.
    const invalidItem = touchedItems.find(
      (it) => !it.description.trim() || !it.qty || !it.projectName.trim(),
    );
    if (invalidItem) {
      const missing = [];
      if (!invalidItem.description.trim()) missing.push("description");
      if (!invalidItem.qty) missing.push("qty");
      if (!invalidItem.projectName.trim()) missing.push("project name");
      setMsg({
        text: `"${invalidItem.description || "An item"}" is missing ${missing.join(", ")}. Fill it in or remove the row before saving.`,
        ok: false,
      });
      return;
    }

    const validItems = touchedItems;

    const missingCustomProcess = validItems.find(
      (it) => it.process === OTHER_PROCESS && !it.processOther.trim(),
    );
    if (missingCustomProcess) {
      setMsg({
        text: `Enter a custom process for "${missingCustomProcess.description}", or pick a preset.`,
        ok: false,
      });
      return;
    }

    setSaving(true);
    try {
      await apiPost("/job-orders", {
        srNo: srNo.trim(),
        date,
        sendFromName: sendFromName.trim(),
        sendFromAddress: sendFromAddress.trim(),
        vendorName: vendorName.trim(),
        vehicleNo,
        issuedBy,
        deliveryAddress,
        items: validItems.map(({ processOther, ...it }) => ({
          description: it.description,
          // Blank stays blank ("" -> null) instead of being coerced to 0, so
          // the backend/UI can tell "not entered" apart from "entered as 0".
          weightPerPc: it.weightPerPc === "" ? null : parseFloat(it.weightPerPc),
          perimeter: it.perimeter === "" ? null : parseFloat(it.perimeter),
          length: it.length === "" ? null : parseFloat(it.length),
          qty: parseFloat(it.qty) || 0,
          unit: it.unit,
          process: it.process === OTHER_PROCESS ? processOther.trim() : it.process,
          ralCode: it.ralCode,
          projectName: it.projectName,
          remark: it.remark,
        })),
        status: "issued",
        history: [
          {
            action: "issued",
            by: user?.name || user?.username,
            at: new Date().toISOString(),
            note: `Issued to ${vendorName}`,
          },
        ],
      });
      setMsg({ text: `✓ Job order ${srNo} created successfully.`, ok: true });
      resetFields();
      load();
      setTimeout(() => {
        setMsg({ text: "", ok: true });
      }, 2500);
    } catch (err) {
      console.error("[JobOrder] create failed", err);
      setMsg({ text: "Error: " + err.message, ok: false });
    } finally {
      setSaving(false);
    }
  }

  // Forwards per-item {receiving, location} straight to the backend, which
  // computes status, appends receipts, and writes its own history entry.
  // Supports PARTIAL receiving — items not fully received stay "pending" and
  // the order's status becomes 'partial', so the list shows "Continue receiving".
  async function handleReceive({ items, receivedBy, challanNo, note }) {
    const order = receiveOrder;
    if (!order?._id) {
      console.error(
        "[JobOrder] handleReceive called with no order / no _id",
        order,
      );
      throw new Error(
        "No order selected — please close and reopen the receive dialog.",
      );
    }
    await apiPatch(`/job-orders/${order._id}/receive`, {
      items,
      receivedBy,
      challanNo,
      note,
    });
    setReceiveOrder(null);
    load();
  }

  // Sends only the changed header fields (and items, if items were
  // editable) to the backend, then refreshes the list. The backend re-runs
  // full validation and re-derives area server-side same as create.
  async function handleEditSave(payload) {
    const order = editOrder;
    if (!order?._id) {
      throw new Error("No order selected — please close and reopen the edit dialog.");
    }
    const updated = await apiPatch(`/job-orders/${order._id}`, payload);
    const updatedId = String(updated._id);
    setOrders((prev) =>
      prev.map((o) =>
        String(o._id) === updatedId ? { ...o, ...updated } : o,
      ),
    );
    if (viewOrder && String(viewOrder._id) === updatedId) {
      setViewOrder({ ...viewOrder, ...updated });
    }
    setEditOrder(null);
    await load();
  }

  async function handlePrintPdf(order) {
    try {
      const full = await apiGet(`/job-orders/${order._id}`);
      setPrintOrder(full);
    } catch (err) {
      console.error("[JobOrder] failed to load order for print", err);
      setPrintOrder(order);
    }
  }

  async function handleDelete(order) {
  if (
    !window.confirm(
      `Delete job order #${order.srNo}? This cannot be undone.`,
    )
  )
    return;
  try {
    await apiDelete(`/job-orders/${order._id}`);
    load();
  } catch (err) {
    console.error("[JobOrder] delete failed", err);
    alert("Failed to delete: " + err.message);
  }
}

  const STATUS_COLORS = {
    issued: { bg: "#e6f2f0", color: "var(--teal-dark)" },
    received: { bg: "#eef2ff", color: "#3730a3" },
    partial: { bg: "#fef3c7", color: "#92400e" },
  };

  const visible =
    statusFilter === "all"
      ? orders
      : orders.filter((o) => o.status === statusFilter);

  function OrderActionButtons({ order, hasPending }) {
    return (
      <div className="jo-order-actions">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setViewOrder(order)}
        >
          👁 View
        </button>
        {canCreate && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setEditOrder(order)}
          >
            ✎ Edit
          </button>
        )}
        {isAdmin && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: "var(--red)" }}
            onClick={() => handleDelete(order)}
          >
            🗑 Delete
          </button>
        )}
        {hasPending && canCreate && (
          <button
            className="btn btn-sm btn-in"
            onClick={() => setReceiveOrder(order)}
          >
            ✓{" "}
            {order.status === "partial"
              ? "Continue receiving"
              : "Received"}
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => handlePrintPdf(order)}
        >
          ⬇ PDF
        </button>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print { .no-print { display: none !important; } }

        /* ── Item row grid (create form + EditModal, via <ItemRow>) ───────── */
        .jo-item-row {
          display: grid;
          grid-template-columns: 1.5fr 0.75fr 0.75fr 0.75fr 0.85fr 0.55fr 0.65fr 0.85fr 1fr 1fr 1fr auto;
          gap: 8px;
          align-items: start;
          padding: 10px;
          border: 1px solid var(--line);
          border-radius: 8px;
          margin-bottom: 8px;
        }
        /* Shared column-header row above the item rows — desktop only.
           Mirrors .jo-item-row's non-mobile column layout (minus the trailing
           delete-button column, which the header replaces with an empty span). */
        .jo-item-header {
          display: grid;
          grid-template-columns: 1.5fr 0.75fr 0.75fr 0.75fr 0.85fr 0.55fr 0.65fr 0.85fr 1fr 1fr 1fr 32px;
          gap: 8px;
          padding: 4px 10px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #8a8270;
        }

        @media (max-width: 1200px) {
          .jo-item-row { grid-template-columns: 1fr 1fr; }
          .jo-item-header { display: none; }
          .jo-item-row .field label { display: block; }
        }

        /* Mobile: ONE field per row, full width */
        @media (max-width: 640px) {
          .jo-item-row { grid-template-columns: 1fr; }
        }

        .jo-item-row .field label { font-size: 11px; margin-bottom: 3px; display: none; color: var(--text-3); font-weight: 600; }
        .jo-item-row .field { display: flex; flex-direction: column; }
        .jo-item-row .field input,
        .jo-item-row .field select {
          padding: 6px 8px; font-size: 13px; height: 32px; width: 100%; box-sizing: border-box;
          border: 1px solid var(--line); border-radius: 6px; background: #fff; color: var(--ink);
          font-family: inherit;
        }
        .jo-item-row .field input:disabled {
          background: var(--paper-dim); color: var(--text-3); cursor: not-allowed;
        }
        .jo-item-row .field select {
          appearance: none; -webkit-appearance: none; -moz-appearance: none;
          background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a8270' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
          background-repeat: no-repeat; background-position: right 8px center; background-size: 14px;
          padding-right: 26px; cursor: pointer;
        }
        .jo-item-row .field input:focus,
        .jo-item-row .field select:focus {
          outline: none; border-color: var(--teal); box-shadow: 0 0 0 3px rgba(0,128,128,0.12);
        }
        .jo-item-row .field input:disabled,
        .jo-item-row .field select:disabled { background: var(--paper-dim); cursor: not-allowed; }
        .jo-item-row .field-other-input { margin-top: 6px; }

        /* Show per-field labels only once the header row above is gone
           (i.e. on mobile) — on desktop the header row already labels
           every column, so repeating labels per-row would be redundant. */
        @media (max-width: 640px) {
          .jo-item-row .field label { display: block; }
        }

        .jo-item-remove {
          height: 32px; width: 32px; border-radius: 6px; border: 1px solid var(--line);
          background: transparent; cursor: pointer; color: var(--red); font-size: 14px;
          flex-shrink: 0; align-self: start;
        }
        .jo-item-remove:disabled { opacity: 0.4; cursor: not-allowed; }
        @media (max-width: 640px) {
          .jo-item-remove { width: 100%; height: 36px; margin-top: 4px; }
        }

        /* ── Receive-modal per-item row (unrelated grid, same mobile fix) ── */
        .jo-receive-row {
          display: grid;
          grid-template-columns: 2fr 0.7fr 0.7fr 0.7fr 1fr;
          gap: 8px;
          align-items: center;
          padding: 8px 10px;
          border: 1px solid var(--line);
          border-radius: 8px;
        }
        @media (max-width: 640px) {
          .jo-receive-row { grid-template-columns: 1fr; }
        }
        .jo-mobile-only-label { display: none; font-size: 11px; font-weight: 600; color: var(--text-3); margin-bottom: 3px; }
        @media (max-width: 640px) {
          .jo-mobile-only-label { display: block; }
        }

        /* ── Page layout ─────────────────────────────────────────────────── */
        .jo-form-card-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
        }
        .jo-list-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 16px;
        }
        .jo-status-filters {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .jo-vendor-custom-row {
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .jo-vendor-custom-row input { flex: 1; min-width: 0; }

        /* ── Orders table (horizontal scroll on narrow screens) ──────────── */
        .jo-orders-wrap {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .jo-orders-table { min-width: 900px; width: 100%; }
        .jo-order-actions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        /* ── Modals ─────────────────────────────────────────────────────── */
        .jo-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(28, 26, 22, 0.6);
          backdrop-filter: blur(4px);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          overflow-y: auto;
        }
        .jo-modal-overlay--high { z-index: 1100; }
        .jo-modal-panel {
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          width: 100%;
          max-height: 95vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .jo-modal-panel--lg { max-width: 980px; }
        .jo-modal-panel--md { max-width: 720px; }
        .jo-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 16px 24px;
          border-bottom: 1px solid var(--line);
          flex-shrink: 0;
        }
        .jo-modal-header-text {
          min-width: 0;
          flex: 1;
        }
        .jo-modal-header-text h2,
        .jo-modal-header-text p {
          word-break: break-word;
          overflow-wrap: anywhere;
        }
        .jo-modal-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .jo-modal-close {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 20px;
          color: #8a8270;
          padding: 4px 8px;
          line-height: 1;
          flex-shrink: 0;
        }
        .jo-modal-form {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          flex: 1;
          min-height: 0;
        }
        .jo-modal-body {
          padding: 20px 24px;
          overflow-y: auto;
          flex: 1;
          min-height: 0;
        }
        .jo-meta-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }
        .jo-items-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
          flex-wrap: wrap;
        }
        .jo-receive-hint {
          margin-bottom: 12px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #8a8270;
          line-height: 1.4;
        }

        @media (max-width: 900px) {
          .jo-status-filters { width: 100%; }
          .jo-status-filters .btn {
            flex: 1 1 calc(50% - 3px);
            min-width: 0;
            justify-content: center;
          }
        }

        @media (max-width: 768px) {
          .jo-modal-overlay {
            padding: 12px;
            align-items: flex-start;
          }
          .jo-modal-panel {
            max-height: calc(100vh - 24px);
          }
          .jo-modal-header { padding: 14px 16px; }
          .jo-modal-body { padding: 14px 16px; }
          .jo-meta-grid { grid-template-columns: 1fr 1fr; }
          .jo-form-card-head { flex-wrap: wrap; }
          .jo-form-card-head h3 { font-size: 15px; line-height: 1.3; }
          .jo-vendor-custom-row {
            flex-direction: column;
            align-items: stretch;
          }
          .jo-vendor-custom-row .btn { width: 100%; }
        }

        @media (max-width: 480px) {
          .jo-modal-overlay { padding: 0; }
          .jo-modal-panel {
            max-height: 100vh;
            min-height: 100vh;
            border-radius: 0;
          }
          .jo-meta-grid { grid-template-columns: 1fr; }
          .jo-status-filters .btn { flex: 1 1 100%; }
          .jo-items-toolbar {
            flex-direction: column;
            align-items: stretch;
          }
          .jo-items-toolbar button { width: 100%; justify-content: center; }
        }
      `}</style>

      {viewOrder && (
        <ViewModal
          order={viewOrder}
          onClose={() => setViewOrder(null)}
          onEdit={
            canCreate
              ? () => {
                  setEditOrder(viewOrder);
                  setViewOrder(null);
                }
              : undefined
          }
        />
      )}
      {receiveOrder && (
        <ReceiveModal
          order={receiveOrder}
          onSave={handleReceive}
          onClose={() => setReceiveOrder(null)}
        />
      )}
      {editOrder && (
        <EditModal
          order={editOrder}
          onSave={handleEditSave}
          onClose={() => setEditOrder(null)}
        />
      )}

      {/* Off-screen mount used purely to feed the browser print/"Save as PDF" dialog
          when the person clicks "PDF" in the orders table below. The print media
          query above forces #job-order-print (inside PrintChallan) to take over the
          page during printing, so this stays invisible the rest of the time. */}
      {printOrder && (
        <div
          style={{ position: "fixed", top: -99999, left: -99999, zIndex: -1 }}
        >
          <PrintChallan order={printOrder} />
        </div>
      )}

      <div className="pagehead">
        <div className="pagehead-text">
          <h2>Job Orders / Delivery Challan</h2>
          <p>
            Create and track delivery challans for goods sent out for work and
            received back.
          </p>
        </div>
        <div className="no-print">
          {!showForm && canCreate && (
            <button className="btn btn-in" onClick={() => setShowForm(true)}>
              + New Job Order
            </button>
          )}
        </div>
      </div>

      {/* ── Create form ── */}
      {showForm && canCreate && (
        <div className="card no-print">
          <div className="jo-form-card-head">
            <h3 style={{ margin: 0 }}>New Job Order / Delivery Challan</h3>
            <button className="btn btn-ghost btn-sm" onClick={resetForm}>
              ✕ Cancel
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Header fields */}
            <div className="formgrid" style={{ marginBottom: 20 }}>
              <div className="field">
                <label>
                  Challan No  <span style={{ color: "var(--red)" }}>*</span>
                </label>
                <input
                  value={srNo}
                  onChange={(e) => setSrNo(e.target.value)}
                  placeholder="e.g. 2136"
                />
              </div>
              <div className="field">
                <label>Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Send From Name</label>
                <input
                  value={sendFromName}
                  onChange={(e) => setSendFromName(e.target.value)}
                  placeholder="Enter sender name"
                />
              </div>
              <div className="field">
                <label>Send From Address</label>
                <input
                  value={sendFromAddress}
                  onChange={(e) => setSendFromAddress(e.target.value)}
                  placeholder="Enter sender address"
                />
              </div>
              <div className="field">
                <label>
                  Vendor Name <span style={{ color: "var(--red)" }}>*</span>
                </label>
                {vendorCustom ? (
                  <div className="jo-vendor-custom-row">
                    <input
                      value={vendorName}
                      onChange={(e) => setVendorName(e.target.value)}
                      placeholder="Enter vendor name"
                      autoFocus
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ whiteSpace: "nowrap" }}
                      onClick={() => {
                        setVendorCustom(false);
                        setVendorName("");
                        setDeliveryAddress("");
                      }}
                    >
                      ← Back
                    </button>
                  </div>
                ) : (
                  <select
                    value={vendorName}
                    onChange={(e) => {
                      if (e.target.value === "__custom__") {
                        setVendorCustom(true);
                        setVendorName("");
                        setDeliveryAddress("");
                      } else {
                        setVendorName(e.target.value);
                        const found = VENDORS.find(
                          (v) => v.name === e.target.value,
                        );
                        if (found) setDeliveryAddress(found.address);
                        else setDeliveryAddress("");
                      }
                    }}
                  >
                    <option value="">— Select vendor —</option>
                    {VENDORS.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                    <option value="__custom__">✎ Add own vendor…</option>
                  </select>
                )}
              </div>

              <div className="field">
                <label>Address of Delivery</label>
                <input
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Auto-filled from vendor, or enter manually"
                />
              </div>
              <div className="field">
                <label>Vehicle No</label>
                <input
                  value={vehicleNo}
                  onChange={(e) => setVehicleNo(e.target.value)}
                  placeholder="e.g. MH04 GU47"
                />
              </div>
              <div className="field">
                <label>
                  Issued By <span style={{ color: "var(--red)" }}>*</span>
                </label>
                <input
                  value={issuedBy}
                  onChange={(e) => setIssuedBy(e.target.value)}
                  placeholder="Your name"
                />
              </div>
            </div>

            {/* Items */}
            <div
              style={{
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h4
                style={{
                  margin: 0,
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  color: "#8a8270",
                }}
              >
                Items
              </h4>
            </div>

            {/* Column-header row — desktop only (hidden on mobile via
                .jo-item-header media query, since the rows below collapse to
                a single stacked column there and per-field labels take over). */}
            <div className="jo-item-header">
              <span>Item Description</span>
              <span>Weight/Pcs (Kg)</span>
              <span>Perimeter (mm)</span>
              <span>Length (mm)</span>
              <span>Area/nos (Sq in)</span>
              <span>Qty</span>
              <span>UOM</span>
              <span>Process</span>
              <span>RAL Code/Finish</span>
              <span>
                Project Name <span style={{ color: "var(--red)" }}>*</span>
              </span>
              <span>Remark</span>
              <span></span>
            </div>

            {items.map((it, idx) => (
              <ItemRow
                key={it._key}
                it={it}
                idx={idx}
                updateItem={updateItem}
                removeItem={removeItem}
                handleProcessSelect={handleProcessSelect}
                disableRemove={items.length === 1}
              />
            ))}

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={addItem}
              style={{ marginBottom: 16 }}
            >
              + Add item
            </button>

            <div className="actionrow">
              <button className="btn btn-in" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Create Job Order"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={resetForm}
              >
                Cancel
              </button>
              {msg.text && (
                <span className={`msg ${msg.ok ? "ok" : "err"}`}>
                  {msg.text}
                </span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* ── Orders list ── */}
      <div className="card no-print">
        <div className="jo-list-head">
          <h3 style={{ margin: 0 }}>
            All Job Orders <span className="pill-count">{visible.length}</span>
          </h3>
          <div className="jo-status-filters">
            {["all", "issued", "partial", "received"].map((s) => (
              <button
                key={s}
                className={`btn btn-sm ${statusFilter === s ? "btn-in" : "btn-ghost"}`}
                onClick={() => setStatusFilter(s)}
                style={{ textTransform: "capitalize" }}
              >
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p style={{ color: "var(--text-3)", fontSize: 13 }}>Loading…</p>
        ) : (
          <div className="tablewrap jo-orders-wrap">
            <table className="jo-orders-table">
              <thead>
                <tr>
                  <th>Challan No</th>
                  <th>Date</th>
                  <th>Vendor Name</th>
                  <th>Vehicle No</th>
                  <th>Issued By</th>
                  <th>Items</th>
                  <th>Received At</th>
                  <th>Send From Name</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((order) => {
                  const sc =
                    STATUS_COLORS[order.status] || STATUS_COLORS.issued;
                  const pendingTotal = (order.items || []).reduce(
                    (sum, it) =>
                      sum + Math.max(0, num(it.qty) - num(it.receivedQty)),
                    0,
                  );
                  const hasPending = pendingTotal > 0.0001;
                  return (
                    <tr key={order._id}>
                      <td className="mono" style={{ fontWeight: 700 }}>
                        {order.srNo}
                      </td>
                      <td>{formatDate(order.date)}</td>
                      <td style={{ fontWeight: 500 }}>{order.vendorName}</td>
                      <td>{order.vehicleNo || "—"}</td>
                      <td>{order.issuedBy || "—"}</td>
                      <td>{order.items?.length || 0}</td>
                      <td>{order.receivedAt || "—"}</td>
                      <td>{order.sendFromName || "—"}</td>
                      <td>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "3px 10px",
                            borderRadius: 12,
                            background: sc.bg,
                            color: sc.color,
                            textTransform: "capitalize",
                          }}
                        >
                          {statusLabel(order)}
                        </span>
                      </td>
                      <td>
                        <OrderActionButtons
                          order={order}
                          hasPending={hasPending}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !visible.length && (
          <div className="empty">
            No job orders yet.
            <p>
              Click <strong>+ New Job Order</strong> above to create your first
              delivery challan.
            </p>
          </div>
        )}
      </div>
    </>
  );
}