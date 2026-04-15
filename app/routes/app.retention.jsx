import { useLoaderData, Form, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// ─── GraphQL ───────────────────────────────────────────────────────────────

const ORDERS_QUERY = `
  query getOrders($cursor: String) {
    orders(first: 250, after: $cursor, query: "status:any financial_status:paid") {
      edges {
        cursor
        node {
          id
          createdAt
          totalPriceSet {
            shopMoney {
              amount
            }
          }
          customer {
            id
          }
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

// ─── Buckets de retención ──────────────────────────────────────────────────

const BUCKETS = [
  { key: "b0_30",    label: "0-30d",    min: 0,   max: 30  },
  { key: "b31_90",   label: "31-90d",   min: 31,  max: 90  },
  { key: "b91_180",  label: "91-180d",  min: 91,  max: 180 },
  { key: "b181_360", label: "181-360d", min: 181, max: 360 },
  { key: "b361plus", label: "361d+",    min: 361, max: 1e9 },
];

// ─── Loader ────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const sp = new URL(request.url).searchParams;

  const currentYear = new Date().getFullYear();
  const firstStart  = sp.get("firstStart")  || `${currentYear}-01-01`;
  const firstEnd    = sp.get("firstEnd")    || `${currentYear}-12-31`;
  const secondStart = sp.get("secondStart") || "";
  const secondEnd   = sp.get("secondEnd")   || "";
  const minAmount   = parseFloat(sp.get("minAmount") || "49");

  // Paginación completa
  let allOrders  = [];
  let cursor     = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const res  = await admin.graphql(ORDERS_QUERY, { variables: { cursor } });
    const json = await res.json();
    const data = json.data.orders;

    for (const edge of data.edges) {
      allOrders.push(edge.node);
      cursor = edge.cursor;
    }
    hasNextPage = data.pageInfo.hasNextPage;
  }

  // Filtrar: cliente asignado y monto >= mínimo
  const validOrders = allOrders.filter(
    (o) => o.customer && parseFloat(o.totalPriceSet.shopMoney.amount) >= minAmount
  );

  // Agrupar por cliente y ordenar cronológicamente
  const byCustomer = {};
  for (const order of validOrders) {
    const id = order.customer.id;
    if (!byCustomer[id]) byCustomer[id] = [];
    byCustomer[id].push({
      date:   new Date(order.createdAt),
      amount: parseFloat(order.totalPriceSet.shopMoney.amount),
    });
  }
  for (const id in byCustomer) {
    byCustomer[id].sort((a, b) => a.date - b.date);
  }

  // Límites de fecha
  const d1Start = new Date(firstStart  + "T00:00:00.000Z");
  const d1End   = new Date(firstEnd    + "T23:59:59.999Z");
  const d2Start = secondStart ? new Date(secondStart + "T00:00:00.000Z") : null;
  const d2End   = secondEnd   ? new Date(secondEnd   + "T23:59:59.999Z") : null;

  // Identificar clientes nuevos y agrupar por mes
  const monthlyData = {};

  for (const id in byCustomer) {
    const orders     = byCustomer[id];
    const firstOrder = orders[0];

    if (firstOrder.date < d1Start || firstOrder.date > d1End) continue;

    const month = firstOrder.date.toISOString().substring(0, 7);
    if (!monthlyData[month]) monthlyData[month] = { month, customers: [] };

    const returnOrders = orders.slice(1).filter((o) => {
      if (d2Start && o.date < d2Start) return false;
      if (d2End   && o.date > d2End)   return false;
      return true;
    });

    monthlyData[month].customers.push({
      firstDate:   firstOrder.date,
      firstAmount: firstOrder.amount,
      returnOrders,
    });
  }

  // Calcular métricas para un conjunto de clientes
  const calcMetrics = (month, customers) => {
    const total = customers.length;
    const aov   = total > 0 ? customers.reduce((s, c) => s + c.firstAmount, 0) / total : 0;

    const buckets = {};
    for (const b of BUCKETS) buckets[b.key] = { count: 0, revenue: 0 };

    let returned = 0;
    let noReturn = 0;

    for (const { firstDate, returnOrders } of customers) {
      if (returnOrders.length === 0) { noReturn++; continue; }

      returned++;

      const daysDiff = Math.floor(
        (returnOrders[0].date - firstDate) / (1000 * 60 * 60 * 24)
      );

      for (const b of BUCKETS) {
        if (daysDiff >= b.min && daysDiff <= b.max) {
          buckets[b.key].count++;
          buckets[b.key].revenue += returnOrders.reduce((s, o) => s + o.amount, 0);
          break;
        }
      }
    }

    return {
      month,
      total,
      aov,
      buckets,
      noReturn,
      returned,
      pctReturned: total > 0 ? (returned / total) * 100 : 0,
    };
  };

  const rows = Object.values(monthlyData)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(({ month, customers }) => calcMetrics(month, customers));

  // Fila de totales (todos los clientes combinados)
  const allCustomers = Object.values(monthlyData).flatMap((m) => m.customers);
  const totals = calcMetrics("TOTAL", allCustomers);

  return {
    rows,
    totals,
    filters: { firstStart, firstEnd, secondStart, secondEnd, minAmount },
  };
};

// ─── Helpers de formato ────────────────────────────────────────────────────

const fmtMXN = (n) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n);

const fmtPct = (n) => n.toFixed(1) + "%";

// ─── Estilos ───────────────────────────────────────────────────────────────

const thStyle = {
  padding: "8px 12px",
  background: "#f6f6f7",
  borderBottom: "2px solid #e1e3e5",
  textAlign: "left",
  fontWeight: "600",
  fontSize: "12px",
  whiteSpace: "nowrap",
  color: "#202223",
};

const tdStyle = {
  padding: "8px 12px",
  borderBottom: "1px solid #e1e3e5",
  fontSize: "13px",
  whiteSpace: "nowrap",
  color: "#202223",
};

const labelStyle = {
  display: "block",
  marginBottom: "4px",
  fontSize: "13px",
  fontWeight: "500",
  color: "#202223",
};

const inputStyle = {
  border: "1px solid #8c9196",
  borderRadius: "4px",
  padding: "6px 10px",
  fontSize: "14px",
  color: "#202223",
  background: "#fff",
  outline: "none",
};

// ─── Componente ────────────────────────────────────────────────────────────

const spinnerStyle = {
  width: "36px",
  height: "36px",
  border: "3px solid #e1e3e5",
  borderTop: "3px solid #008060",
  borderRadius: "50%",
  animation: "spin 0.8s linear infinite",
};

export default function RetentionPage() {
  const { rows, totals, filters } = useLoaderData();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  // ── Exportar CSV ──────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const header = [
      "Mes", "Nuevos", "AOV (MXN)",
      "0-30d #",    "0-30d %",    "0-30d Rev",
      "31-90d #",   "31-90d %",   "31-90d Rev",
      "91-180d #",  "91-180d %",  "91-180d Rev",
      "181-360d #", "181-360d %", "181-360d Rev",
      "361d+ #",    "361d+ %",    "361d+ Rev",
      "No volvieron #", "No volvieron %",
      "% Sí Volvieron",
    ].join(",");

    const rowToCSV = (row) => {
      const cols = [row.month, row.total, row.aov.toFixed(0)];
      for (const b of BUCKETS) {
        const bm  = row.buckets[b.key];
        const pct = row.total > 0 ? (bm.count / row.total) * 100 : 0;
        cols.push(bm.count, fmtPct(pct), bm.revenue.toFixed(0));
      }
      const noRetPct = row.total > 0 ? (row.noReturn / row.total) * 100 : 0;
      cols.push(row.noReturn, fmtPct(noRetPct), fmtPct(row.pctReturned));
      return cols.join(",");
    };

    const csv  = [header, ...rows.map(rowToCSV), rowToCSV(totals)].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const today = new Date().toISOString().substring(0, 10);
    a.href     = url;
    a.download = `retencion_clientes_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Fila de tabla ─────────────────────────────────────────────────────────
  const renderRow = (row, isTotal = false) => {
    const rowStyle = isTotal
      ? { fontWeight: "700", background: "#f6f6f7" }
      : {};

    return (
      <tr key={row.month} style={rowStyle}>
        <td style={tdStyle}>{row.month}</td>
        <td style={{ ...tdStyle, textAlign: "right" }}>{row.total}</td>
        <td style={{ ...tdStyle, textAlign: "right" }}>{fmtMXN(row.aov)}</td>

        {BUCKETS.map((b) => {
          const bm  = row.buckets[b.key];
          const pct = row.total > 0 ? (bm.count / row.total) * 100 : 0;
          return (
            <td key={b.key} style={{ ...tdStyle, textAlign: "right" }}>
              {bm.count}
              <span style={{ color: "#6d7175", margin: "0 4px" }}>·</span>
              {fmtPct(pct)}
              <span style={{ color: "#6d7175", margin: "0 4px" }}>·</span>
              {fmtMXN(bm.revenue)}
            </td>
          );
        })}

        <td style={{ ...tdStyle, textAlign: "right" }}>
          {row.noReturn}
          <span style={{ color: "#6d7175", margin: "0 4px" }}>·</span>
          {fmtPct(row.total > 0 ? (row.noReturn / row.total) * 100 : 0)}
        </td>

        <td style={{ ...tdStyle, textAlign: "center" }}>
          <span
            style={{
              display: "inline-block",
              padding: "2px 10px",
              borderRadius: "20px",
              background: row.pctReturned > 20 ? "#ceead6" : "#ffd2d2",
              color:      row.pctReturned > 20 ? "#1a7f4b" : "#c0392b",
              fontWeight: "600",
              fontSize:   "12px",
            }}
          >
            {fmtPct(row.pctReturned)}
          </span>
        </td>
      </tr>
    );
  };

  return (
    <s-page heading="Retención de Clientes Nuevos">
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {isLoading && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(255,255,255,0.75)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          zIndex: 9999, gap: "14px",
        }}>
          <div style={spinnerStyle} />
          <p style={{ color: "#202223", fontWeight: "500", fontSize: "14px", margin: 0 }}>
            Aplicando filtros…
          </p>
        </div>
      )}

      {/* ── Filtros ── */}
      <s-section heading="Filtros">
        <Form method="get" id="retention-form">
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "16px",
              alignItems: "flex-end",
            }}
          >
            <div>
              <label style={labelStyle}>Inicio 1ª compra</label>
              <input
                type="date"
                name="firstStart"
                defaultValue={filters.firstStart}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Fin 1ª compra</label>
              <input
                type="date"
                name="firstEnd"
                defaultValue={filters.firstEnd}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Inicio 2ª compra</label>
              <input
                type="date"
                name="secondStart"
                defaultValue={filters.secondStart}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Fin 2ª compra</label>
              <input
                type="date"
                name="secondEnd"
                defaultValue={filters.secondEnd}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Monto mínimo (MXN)</label>
              <input
                type="number"
                name="minAmount"
                defaultValue={filters.minAmount}
                min="0"
                style={{ ...inputStyle, width: "110px" }}
              />
            </div>

            <s-button
              variant="primary"
              onClick={() =>
                document.getElementById("retention-form").requestSubmit()
              }
            >
              Aplicar filtros
            </s-button>

            <div style={{ marginLeft: "auto" }}>
              <s-button onClick={handleExportCSV}>Exportar CSV</s-button>
            </div>
          </div>
        </Form>
      </s-section>

      {/* ── Tabla ── */}
      {rows.length === 0 ? (
        <s-section heading="Sin resultados">
          <s-paragraph>
            No se encontraron clientes nuevos en el rango seleccionado. Ajusta
            los filtros e intenta de nuevo.
          </s-paragraph>
        </s-section>
      ) : (
        <s-section
          heading={`Resultados — ${rows.length} mes${rows.length !== 1 ? "es" : ""}`}
        >
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontFamily: "inherit",
              }}
            >
              <thead>
                <tr>
                  <th style={thStyle}>Mes</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Nuevos</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>AOV</th>
                  {BUCKETS.map((b) => (
                    <th key={b.key} style={{ ...thStyle, textAlign: "right" }}>
                      {b.label}
                      <br />
                      <span style={{ fontWeight: 400, fontSize: "11px", color: "#6d7175" }}>
                        # · % · Rev
                      </span>
                    </th>
                  ))}
                  <th style={{ ...thStyle, textAlign: "right" }}>
                    No volvieron
                    <br />
                    <span style={{ fontWeight: 400, fontSize: "11px", color: "#6d7175" }}>
                      # · %
                    </span>
                  </th>
                  <th style={{ ...thStyle, textAlign: "center" }}>% Sí Volvieron</th>
                </tr>
              </thead>
              <tbody>{rows.map((row) => renderRow(row))}</tbody>
              <tfoot>{renderRow(totals, true)}</tfoot>
            </table>
          </div>
        </s-section>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
