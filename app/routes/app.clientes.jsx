import { useLoaderData, Form } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// ─── GraphQL ────────────────────────────────────────────────────────────────

const ORDERS_QUERY = `
  query getOrders($cursor: String, $query: String) {
    orders(first: 250, after: $cursor, query: $query) {
      edges {
        cursor
        node {
          id
          name
          createdAt
          totalPriceSet {
            shopMoney {
              amount
            }
          }
          customer {
            id
            firstName
            lastName
            email
          }
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

// ─── Loader ─────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const sp = new URL(request.url).searchParams;

  const currentYear = new Date().getFullYear();
  const dateStart   = sp.get("dateStart") || `${currentYear}-01-01`;
  const dateEnd     = sp.get("dateEnd")   || `${currentYear}-12-31`;
  const minAmount   = parseFloat(sp.get("minAmount") || "0");
  const minOrders   = parseInt(sp.get("minOrders")   || "1", 10);
  const search      = (sp.get("search") || "").trim().toLowerCase();

  // Construir filtro de query para Shopify
  const queryFilter = [
    `created_at:>='${dateStart}T00:00:00Z'`,
    `created_at:<='${dateEnd}T23:59:59Z'`,
    "financial_status:paid",
  ].join(" ");

  // Paginar todas las órdenes del período
  let allOrders   = [];
  let cursor      = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const res  = await admin.graphql(ORDERS_QUERY, { variables: { cursor, query: queryFilter } });
    const json = await res.json();
    const data = json.data.orders;

    for (const edge of data.edges) {
      allOrders.push(edge.node);
      cursor = edge.cursor;
    }
    hasNextPage = data.pageInfo.hasNextPage;
  }

  // Filtrar órdenes con cliente asignado y monto >= mínimo
  const validOrders = allOrders.filter(
    (o) =>
      o.customer &&
      parseFloat(o.totalPriceSet.shopMoney.amount) >= minAmount
  );

  // Agrupar por cliente
  const byCustomer = {};
  for (const order of validOrders) {
    const cid = order.customer.id;
    if (!byCustomer[cid]) {
      byCustomer[cid] = {
        id:        cid,
        nombre:    `${order.customer.firstName || ""} ${order.customer.lastName || ""}`.trim() || "Sin nombre",
        email:     order.customer.email || "—",
        ordenes:   [],
      };
    }
    byCustomer[cid].ordenes.push({
      id:     order.id,
      folio:  order.name,
      fecha:  new Date(order.createdAt),
      monto:  parseFloat(order.totalPriceSet.shopMoney.amount),
    });
  }

  // Calcular métricas por cliente
  let clientes = Object.values(byCustomer).map((c) => {
    const montos      = c.ordenes.map((o) => o.monto);
    const totalGastado = montos.reduce((s, m) => s + m, 0);
    const fechas       = c.ordenes.map((o) => o.fecha).sort((a, b) => a - b);

    return {
      id:            c.id,
      nombre:        c.nombre,
      email:         c.email,
      numOrdenes:    c.ordenes.length,
      totalGastado,
      ticketPromedio: totalGastado / c.ordenes.length,
      primeraCompra: fechas[0].toISOString().substring(0, 10),
      ultimaCompra:  fechas[fechas.length - 1].toISOString().substring(0, 10),
    };
  });

  // Filtros adicionales del lado del servidor
  if (minOrders > 1) {
    clientes = clientes.filter((c) => c.numOrdenes >= minOrders);
  }
  if (search) {
    clientes = clientes.filter(
      (c) =>
        c.nombre.toLowerCase().includes(search) ||
        c.email.toLowerCase().includes(search)
    );
  }

  // Ordenar por total gastado desc
  clientes.sort((a, b) => b.totalGastado - a.totalGastado);

  // Resumen
  const totalClientes = clientes.length;
  const totalOrdenes  = clientes.reduce((s, c) => s + c.numOrdenes, 0);
  const totalRevenue  = clientes.reduce((s, c) => s + c.totalGastado, 0);
  const avgPerCliente = totalClientes > 0 ? totalRevenue / totalClientes : 0;

  return {
    clientes,
    resumen: { totalClientes, totalOrdenes, totalRevenue, avgPerCliente },
    filters: { dateStart, dateEnd, minAmount, minOrders, search },
  };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtMXN = (n) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n);

// ─── Estilos ─────────────────────────────────────────────────────────────────

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

const statCardStyle = {
  flex: "1 1 160px",
  padding: "16px 20px",
  border: "1px solid #e1e3e5",
  borderRadius: "8px",
  background: "#fff",
};

// ─── Componente ──────────────────────────────────────────────────────────────

export default function ClientesPage() {
  const { clientes, resumen, filters } = useLoaderData();

  // ── Exportar CSV ────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const header = [
      "Nombre",
      "Email",
      "# Órdenes",
      "Total Gastado (MXN)",
      "Ticket Promedio (MXN)",
      "Primera Compra",
      "Última Compra",
    ].join(",");

    const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;

    const lines = clientes.map((c) =>
      [
        escape(c.nombre),
        escape(c.email),
        c.numOrdenes,
        c.totalGastado.toFixed(2),
        c.ticketPromedio.toFixed(2),
        c.primeraCompra,
        c.ultimaCompra,
      ].join(",")
    );

    const csv   = [header, ...lines].join("\n");
    const blob  = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url   = URL.createObjectURL(blob);
    const a     = document.createElement("a");
    const today = new Date().toISOString().substring(0, 10);
    a.href      = url;
    a.download  = `clientes_${filters.dateStart}_${filters.dateEnd}_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <s-page heading="Reporte de Clientes">

      {/* ── Resumen ── */}
      <s-section heading="Resumen del período">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
          <div style={statCardStyle}>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "#202223" }}>
              {resumen.totalClientes.toLocaleString("es-MX")}
            </div>
            <div style={{ fontSize: "13px", color: "#6d7175", marginTop: "2px" }}>
              Clientes únicos
            </div>
          </div>
          <div style={statCardStyle}>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "#202223" }}>
              {resumen.totalOrdenes.toLocaleString("es-MX")}
            </div>
            <div style={{ fontSize: "13px", color: "#6d7175", marginTop: "2px" }}>
              Órdenes totales
            </div>
          </div>
          <div style={statCardStyle}>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "#1a7f4b" }}>
              {fmtMXN(resumen.totalRevenue)}
            </div>
            <div style={{ fontSize: "13px", color: "#6d7175", marginTop: "2px" }}>
              Ingresos en el período
            </div>
          </div>
          <div style={statCardStyle}>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "#202223" }}>
              {fmtMXN(resumen.avgPerCliente)}
            </div>
            <div style={{ fontSize: "13px", color: "#6d7175", marginTop: "2px" }}>
              Promedio por cliente
            </div>
          </div>
        </div>
      </s-section>

      {/* ── Filtros ── */}
      <s-section heading="Filtros">
        <Form method="get" id="clientes-form">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-end" }}>

            <div>
              <label style={labelStyle}>Desde</label>
              <input
                type="date"
                name="dateStart"
                defaultValue={filters.dateStart}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Hasta</label>
              <input
                type="date"
                name="dateEnd"
                defaultValue={filters.dateEnd}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Monto mínimo por orden (MXN)</label>
              <input
                type="number"
                name="minAmount"
                defaultValue={filters.minAmount}
                min="0"
                style={{ ...inputStyle, width: "130px" }}
              />
            </div>

            <div>
              <label style={labelStyle}>Mínimo de órdenes</label>
              <input
                type="number"
                name="minOrders"
                defaultValue={filters.minOrders}
                min="1"
                style={{ ...inputStyle, width: "100px" }}
              />
            </div>

            <div>
              <label style={labelStyle}>Buscar nombre / email</label>
              <input
                type="text"
                name="search"
                defaultValue={filters.search}
                placeholder="ej. juan@correo.com"
                style={{ ...inputStyle, width: "220px" }}
              />
            </div>

            <s-button
              variant="primary"
              onClick={() =>
                document.getElementById("clientes-form").requestSubmit()
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
      {clientes.length === 0 ? (
        <s-section heading="Sin resultados">
          <s-paragraph>
            No se encontraron clientes con los filtros seleccionados. Ajusta el
            rango de fechas o los criterios de búsqueda.
          </s-paragraph>
        </s-section>
      ) : (
        <s-section
          heading={`${resumen.totalClientes.toLocaleString("es-MX")} cliente${resumen.totalClientes !== 1 ? "s" : ""} — ordenados por total gastado`}
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
                  <th style={{ ...thStyle, width: "32px", textAlign: "right" }}>#</th>
                  <th style={thStyle}>Nombre</th>
                  <th style={thStyle}>Email</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Órdenes</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Total gastado</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Ticket prom.</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Primera compra</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Última compra</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c, idx) => (
                  <tr key={c.id}>
                    <td style={{ ...tdStyle, textAlign: "right", color: "#6d7175" }}>
                      {idx + 1}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: "500", maxWidth: "200px" }}>
                      {c.nombre}
                    </td>
                    <td style={{ ...tdStyle, color: "#6d7175" }}>{c.email}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: "20px",
                          background: c.numOrdenes >= 3 ? "#ceead6" : "#f6f6f7",
                          color: c.numOrdenes >= 3 ? "#1a7f4b" : "#202223",
                          fontWeight: "600",
                          fontSize: "12px",
                        }}
                      >
                        {c.numOrdenes}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: "700" }}>
                      {fmtMXN(c.totalGastado)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", color: "#6d7175" }}>
                      {fmtMXN(c.ticketPromedio)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", color: "#6d7175" }}>
                      {c.primeraCompra}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", color: "#6d7175" }}>
                      {c.ultimaCompra}
                    </td>
                  </tr>
                ))}
              </tbody>
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
