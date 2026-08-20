import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { todayStr } from "../utils/helpers";

// ── API helpers (add these to your api.js too) ────────────────────────────────
const API = "/api";
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

const emptyItem = () => ({
  _key: Math.random().toString(36).slice(2),
  description: "",
  size: "",
  qty: "",
  unit: "NOS",
  projectName: "",
  ralCode: "",
  finish: "",
  finishOther: "", // typed value when finish === OTHER_FINISH
  remark: "",
});

const LOCATIONS = ["Factory", "Site"];
const UNITS = ["NOS", "MTR", "KG", "SET", "PKT", "BOX", "LTR"];
const FINISH_OPTIONS = ["Powder Coating", "Galvanized", "Hot-Dip"];
const OTHER_FINISH = "__other_finish__";

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
];
const OTHER_VENDOR = "__other__";

const COMPANY_LOGO_URL =
  "https://www.profile-solution.com/wp-content/uploads/PS-Logo-1-e1771321686738.png";
const COMPANY_NAME = "PROFILE DATA CENTER SOLUTIONS PVT. LTD.";
const COMPANY_ADDRESS_SHORT =
  "Office No. 1701, Friends Business Bay, LT Road, Near Veer Savarkar Garden, Borivali (W), Mumbai : 400092";

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
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

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
  const margin = orientation === "landscape" ? "12mm" : "10mm";
  styleEl.textContent = `@page { size: A4 ${orientation}; margin: ${margin}; }`;
}

// ── Delivery Challan Print Template ───────────────────────────────────────────
function PrintChallan({ order }) {
  const ref = useRef();

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
          padding: 24,
          maxWidth: 800,
          margin: "0 auto",
        }}
      >
        {/* Header */}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
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
                  fontSize: 11,
                  lineHeight: 1.6,
                }}
              >
                <strong>Principal Place of Business:</strong>
                <br />
                {COMPANY_ADDRESS_SHORT}
                <div style={{ height: 8 }} />
                <strong>Additional Places of Business: Factory</strong>
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
                    color: "#555",
                    marginBottom: 5,
                  }}
                >
                  Address Of Delivery
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
                        <strong>SR. No :</strong>
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

        {/* Items table */}
        <table
          style={{ width: "100%", borderCollapse: "collapse", marginTop: -1 }}
        >
          <thead>
            <tr style={{ background: "#f3f1ec" }}>
              {[
                "Sr No.",
                "Material Name",
                "Size",
                "Qty",
                "Unit",
                "Project Name",
                "RAL Code",
                "Finish",
                "Remark",
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    border: "1px solid #000",
                    padding: "8px 8px",
                    textAlign: "center",
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: "0.03em",
                    textTransform: "uppercase",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td
                  style={{
                    border: "1px solid #000",
                    borderTop: "none",
                    padding: "6px 8px",
                    textAlign: "center",
                    width: 40,
                  }}
                >
                  {i + 1}
                </td>
                <td
                  style={{
                    border: "1px solid #000",
                    borderTop: "none",
                    padding: "6px 8px",
                  }}
                >
                  {it.description}
                </td>
                <td
                  style={{
                    border: "1px solid #000",
                    borderTop: "none",
                    padding: "6px 8px",
                    textAlign: "center",
                  }}
                >
                  {it.size || "—"}
                </td>
                <td
                  style={{
                    border: "1px solid #000",
                    borderTop: "none",
                    padding: "6px 8px",
                    textAlign: "center",
                  }}
                >
                  {it.qty}
                </td>
                <td
                  style={{
                    border: "1px solid #000",
                    borderTop: "none",
                    padding: "6px 8px",
                    textAlign: "center",
                  }}
                >
                  {it.unit}
                </td>
                <td
                  style={{
                    border: "1px solid #000",
                    borderTop: "none",
                    padding: "6px 8px",
                    textAlign: "center",
                  }}
                >
                  {it.projectName || "—"}
                </td>
                <td
                  style={{
                    border: "1px solid #000",
                    borderTop: "none",
                    padding: "6px 8px",
                    textAlign: "center",
                  }}
                >
                  {it.ralCode || "—"}
                </td>
                <td
                  style={{
                    border: "1px solid #000",
                    borderTop: "none",
                    padding: "6px 8px",
                    textAlign: "center",
                  }}
                >
                  {it.finish || "—"}
                </td>
                <td
                  style={{
                    border: "1px solid #000",
                    borderTop: "none",
                    padding: "6px 8px",
                  }}
                >
                  {it.remark || "—"}
                </td>
              </tr>
            ))}
            {/* Empty rows for spacing */}
            {Array.from({ length: Math.max(0, 5 - items.length) }).map(
              (_, i) => (
                <tr key={`empty-${i}`}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td
                      key={j}
                      style={{
                        border: "1px solid #000",
                        borderTop: "none",
                        padding: "13px 8px",
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
                <div style={{ marginBottom: 10 }}>
                  <strong>Received Person Name :</strong>{" "}
                  {order.receivedBy || " ___________________"}
                </div>
                <div style={{ marginBottom: 10 }}>
                  <strong>Received Person Sign :</strong> ___________________
                </div>
                <div>
                  <strong>Mobile No :</strong> ___________________
                </div>
              </td>
              <td
                style={{
                  border: "1px solid #000",
                  borderTop: "none",
                  borderLeft: "none",
                  padding: "12px 14px",
                  textAlign: "center",
                  verticalAlign: "bottom",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    marginBottom: 34,
                    letterSpacing: "0.02em",
                  }}
                >
                  FOR PROFILE SOLUTION
                </div>
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
      padding: 20px !important;
    }
  }
`;

// ── Receiving Receipt / Items-only Print Style ────────────────────────────────
// #job-order-items-print is the RECEIVING RECEIPT (PrintItemsTable below) —
// landscape, since it's an 11-column wide table (Sr, Description, Size,
// Outward, Received (where), Pending, Unit, Project Name, RAL Code, Finish,
// Remark) that needs the extra horizontal room.
// ── Receiving Receipt / Items-only Print Style ────────────────────────────────
// #job-order-items-print is the RECEIVING RECEIPT (PrintItemsTable below) —
// landscape, since it's an 11-column wide table (Sr, Description, Size,
// Outward, Received (where), Pending, Unit, Project Name, RAL Code, Finish,
// Remark) that needs the extra horizontal room.
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
                SR No
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
                Challan No
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
                {order.status || "issued"}
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
            <col style={{ width: "3.5%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "14.5%" }} />
          </colgroup>
          <thead>
            <tr style={{ background: "#f3f1ec" }}>
              {[
                "Sr",
                "Material Name",
                "Size",
                "Outward",
                "Received (where)",
                "Pending",
                "Unit",
                "Project Name",
                "RAL Code",
                "Finish",
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
                    {it.size || "—"}
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
                    {it.projectName || "—"}
                  </td>
                  <td style={{ ...cellBase, textAlign: "center" }}>
                    {it.ralCode || "—"}
                  </td>
                  <td style={{ ...cellBase, textAlign: "center" }}>
                    {it.finish || "—"}
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

// ── View Details Modal ────────────────────────────────────────────────────────
function ViewModal({ order, onClose }) {
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

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28,26,22,0.6)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        overflowY: "auto",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          width: "100%",
          maxWidth: 900,
          maxHeight: "95vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            borderBottom: "1px solid var(--line)",
            flexShrink: 0,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              Job Order #{order.srNo}
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8a8270" }}>
              {formatDate(order.date)} · {order.vendorName} ·{" "}
              {order.vehicleNo || "—"}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 20,
              color: "#8a8270",
              padding: "4px 8px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal body */}
        <div style={{ overflowY: "auto", flex: 1, padding: "20px 24px" }}>
          {/* Meta info */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginBottom: 20,
            }}
          >
            {[
              { label: "SR No", value: order.srNo },
              { label: "Date", value: formatDate(order.date) },
              { label: "Vendor Name", value: order.vendorName },
              { label: "Vehicle No", value: order.vehicleNo || "—" },
              { label: "Issued By", value: order.issuedBy || "—" },
              {
                label: "Delivery Address",
                value: order.deliveryAddress || "—",
              },
              { label: "Status", value: order.status || "issued" },
              { label: "Challan No", value: order.challanNo || "—" },
              { label: "Received At", value: order.receivedAt || "—" },
              { label: "Received By", value: order.receivedBy || "—" },
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
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
            <PrintItemsTable order={order} />
          </div>
          <div className="tablewrap" style={{ marginBottom: 20 }}>
            <table>
              <thead>
                <tr>
                  <th>Sr No</th>
                  <th>Material Name</th>
                  <th>Size</th>
                  <th className="num">Outward</th>
                  <th>Received (where)</th>
                  <th className="num">Pending</th>
                  <th>Unit</th>
                  <th>Project Name</th>
                  <th>RAL Code</th>
                  <th>Finish</th>
                  <th>Remark</th>
                </tr>
              </thead>
              <tbody>
                {(order.items || []).map((it, i) => {
                  const received = num(it.receivedQty);
                  const pending = Math.max(0, num(it.qty) - received);
                  const receipts = it.receipts || [];
                  return (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td style={{ fontWeight: 500 }}>{it.description}</td>
                      <td>{it.size || "—"}</td>
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
                      <td>{it.projectName || "—"}</td>
                      <td>{it.ralCode || "—"}</td>
                      <td>{it.finish || "—"}</td>
                      <td>{it.remark || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Transaction history */}
          {order.history?.length > 0 && (
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
                {order.history.map((h, i) => (
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
          <PrintChallan order={order} />
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
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(28,26,22,0.6)",
        backdropFilter: "blur(4px)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        overflowY: "auto",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          width: "100%",
          maxWidth: 720,
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            borderBottom: "1px solid var(--line)",
            flexShrink: 0,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
            Mark as Received — #{order.srNo}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 18,
              color: "#8a8270",
            }}
          >
            ✕
          </button>
        </div>
        <form
          onSubmit={handleSave}
          style={{
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "20px 24px", overflowY: "auto" }}>
            <div
              style={{
                marginBottom: 8,
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#8a8270",
              }}
            >
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
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 0.7fr 0.7fr 0.7fr 1fr",
                      gap: 8,
                      alignItems: "center",
                      padding: "8px 10px",
                      border: "1px solid var(--line)",
                      borderRadius: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {it.description}
                      </div>
                      <div style={{ fontSize: 11, color: "#8a8270" }}>
                        Outward {it.qty} {it.unit}{" "}
                        {it.size ? `· ${it.size}` : ""}
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
                  Challan No <span style={{ color: "red" }}>*</span>
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

// ── Main component ─────────────────────────────────────────────────────────────
// ── Main component ─────────────────────────────────────────────
export default function JobOrder() {
  const { user } = useAuth();

  const [orders, setOrders] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [viewOrder, setViewOrder] = useState(null);
  const [receiveOrder, setReceiveOrder] = useState(null);
  const [printOrder, setPrintOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: "", ok: true });
  const [statusFilter, setStatusFilter] = useState("all");

  // Form state
  const [srNo, setSrNo] = useState("");
  const [date, setDate] = useState(todayStr());
  const [vendorName, setVendorName] = useState("");
  const [vendorCustom, setVendorCustom] = useState(false);
  const [vehicleNo, setVehicleNo] = useState("");
  const [issuedBy, setIssuedBy] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");

  const [items, setItems] = useState([emptyItem()]);

  // ... load(), print effect, etc. unchanged ...
  function resetFields() {
    setSrNo("");
    setDate(todayStr());
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

  // Called from the Finish <select> in each item row.
  function handleFinishSelect(key, val) {
    if (val === OTHER_FINISH) {
      updateItem(key, { finish: OTHER_FINISH });
    } else {
      updateItem(key, { finish: val, finishOther: "" });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg({ text: "", ok: true });
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
    const validItems = items.filter(
      (it) => it.description.trim() && it.qty && it.projectName.trim(),
    );
    if (!validItems.length) {
      setMsg({
        text: "Add at least one item with description, qty, and project name.",
        ok: false,
      });
      return;
    }
    const missingCustomFinish = validItems.find(
      (it) => it.finish === OTHER_FINISH && !it.finishOther.trim(),
    );
    if (missingCustomFinish) {
      setMsg({
        text: `Enter a custom finish for "${missingCustomFinish.description}", or pick a preset.`,
        ok: false,
      });
      return;
    }

    setSaving(true);
    try {
      await apiPost("/job-orders", {
        srNo,
        date,
        vendorName,
        vehicleNo,
        issuedBy,
        deliveryAddress,

        items: validItems.map(({ finishOther, ...it }) => ({
          ...it,
          qty: parseFloat(it.qty) || 0,
          finish: it.finish === OTHER_FINISH ? finishOther.trim() : it.finish,
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
        setShowForm(false);
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

  const STATUS_COLORS = {
    issued: { bg: "#e6f2f0", color: "var(--teal-dark)" },
    received: { bg: "#eef2ff", color: "#3730a3" },
    partial: { bg: "#fef3c7", color: "#92400e" },
  };

  const visible =
    statusFilter === "all"
      ? orders
      : orders.filter((o) => o.status === statusFilter);

  return (
    <>
      <style>{`
        @media print { .no-print { display: none !important; } }
        .jo-item-row { display: grid; grid-template-columns: 2fr 0.8fr 0.7fr 0.7fr 1fr 0.8fr 0.9fr 1fr auto; gap: 8px; align-items: start; padding: 10px; border: 1px solid var(--line); border-radius: 8px; margin-bottom: 8px; }
        @media (max-width: 900px) { .jo-item-row { grid-template-columns: 1fr 1fr 0.8fr 0.8fr; } }
        @media (max-width: 600px) { .jo-item-row { grid-template-columns: 1fr 1fr; } }
        .jo-item-row .field label { font-size: 11px; margin-bottom: 3px; display: block; color: var(--text-3); font-weight: 600; }
        .jo-item-row .field { display: flex; flex-direction: column; }
        .jo-item-row .field input,
        .jo-item-row .field select {
          padding: 6px 8px; font-size: 13px; height: 32px; width: 100%; box-sizing: border-box;
          border: 1px solid var(--line); border-radius: 6px; background: #fff; color: var(--ink);
          font-family: inherit;
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
      `}</style>

      {viewOrder && (
        <ViewModal order={viewOrder} onClose={() => setViewOrder(null)} />
      )}
      {receiveOrder && (
        <ReceiveModal
          order={receiveOrder}
          onSave={handleReceive}
          onClose={() => setReceiveOrder(null)}
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
          {!showForm && (
            <button className="btn btn-in" onClick={() => setShowForm(true)}>
              + New Job Order
            </button>
          )}
        </div>
      </div>

      {/* ── Create form ── */}
      {showForm && (
        <div className="card no-print">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
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
                  SR No <span style={{ color: "var(--red)" }}>*</span>
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
                <label>
                  Vendor Name <span style={{ color: "var(--red)" }}>*</span>
                </label>
                {vendorCustom ? (
                  <div style={{ display: "flex", gap: 6 }}>
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

              <div className="field full">
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
              {/* <div className="field full">
                <label>Address of Delivery</label>
                <input
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="e.g. C.K. Ceiling, Wada Site"
                />
              </div> */}
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

            {/* Item table header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "2fr 0.8fr 0.7fr 0.7fr 1fr 0.8fr 0.9fr 1fr 32px",
                gap: 8,
                padding: "4px 10px",
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#8a8270",
              }}
            >
              <span>Material Name</span>
              <span>Size</span>
              <span>Qty</span>
              <span>Unit</span>
              <span>
                Project Name <span style={{ color: "var(--red)" }}>*</span>
              </span>
              <span>RAL Code</span>
              <span>Finish</span>
              <span>Remark</span>
              <span></span>
            </div>

            {items.map((it, idx) => (
              <div key={it._key} className="jo-item-row">
                <div className="field">
                  <input
                    value={it.description}
                    onChange={(e) =>
                      updateItem(it._key, { description: e.target.value })
                    }
                    placeholder={`Item ${idx + 1} material name`}
                  />
                </div>
                <div className="field">
                  <input
                    value={it.size}
                    onChange={(e) =>
                      updateItem(it._key, { size: e.target.value })
                    }
                    placeholder="e.g. 4000"
                  />
                </div>
                <div className="field">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={it.qty}
                    onChange={(e) =>
                      updateItem(it._key, { qty: e.target.value })
                    }
                    placeholder="0"
                  />
                </div>
                <div className="field">
                  <select
                    value={it.unit}
                    onChange={(e) =>
                      updateItem(it._key, { unit: e.target.value })
                    }
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <input
                    value={it.projectName}
                    onChange={(e) =>
                      updateItem(it._key, { projectName: e.target.value })
                    }
                    placeholder="Project name"
                  />
                </div>
                <div className="field">
                  <input
                    value={it.ralCode}
                    onChange={(e) =>
                      updateItem(it._key, { ralCode: e.target.value })
                    }
                    placeholder="e.g. RAL 9010"
                  />
                </div>
                <div className="field">
                  <select
                    value={it.finish}
                    onChange={(e) =>
                      handleFinishSelect(it._key, e.target.value)
                    }
                  >
                    <option value="">Select finish…</option>
                    {FINISH_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                    <option value={OTHER_FINISH}>Other (type your own)</option>
                  </select>
                  {it.finish === OTHER_FINISH && (
                    <input
                      className="field-other-input"
                      value={it.finishOther}
                      onChange={(e) =>
                        updateItem(it._key, { finishOther: e.target.value })
                      }
                      placeholder="Enter finish"
                    />
                  )}
                </div>
                <div className="field">
                  <input
                    value={it.remark}
                    onChange={(e) =>
                      updateItem(it._key, { remark: e.target.value })
                    }
                    placeholder="NTT, NAV DC-3…"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(it._key)}
                  disabled={items.length === 1}
                  style={{
                    height: 32,
                    width: 32,
                    borderRadius: 6,
                    border: "1px solid var(--line)",
                    background: "transparent",
                    cursor: "pointer",
                    color: "var(--red)",
                    fontSize: 14,
                    flexShrink: 0,
                    alignSelf: "start",
                    marginTop: 0,
                  }}
                >
                  ✕
                </button>
              </div>
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <h3 style={{ margin: 0 }}>
            All Job Orders <span className="pill-count">{visible.length}</span>
          </h3>
          <div style={{ display: "flex", gap: 6 }}>
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
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>SR No</th>
                  <th>Date</th>
                  <th>Vendor Name</th>
                  <th>Vehicle No</th>
                  <th>Issued By</th>
                  <th>Items</th>
                  <th>Status</th>
                  <th>Received At</th>
                  <th>Received By</th>
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
                          {order.status || "issued"}
                        </span>
                      </td>
                      <td>{order.receivedAt || "—"}</td>
                      <td>{order.receivedBy || "—"}</td>
                      <td>
                        <div
                          style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                        >
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setViewOrder(order)}
                          >
                            👁 View
                          </button>
                          {hasPending && (
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
                            onClick={() => setPrintOrder(order)}
                          >
                            ⬇ PDF
                          </button>
                        </div>
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
