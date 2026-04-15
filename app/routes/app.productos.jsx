import { useLoaderData, Form, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// ─── GraphQL ────────────────────────────────────────────────────────────────

const PRODUCTS_QUERY = `
  query getProducts($cursor: String) {
    products(first: 250, after: $cursor) {
      edges {
        cursor
        node {
          id
          title
          status
          vendor
          productType
          totalInventory
          variants(first: 100) {
            edges {
              node {
                id
                title
                price
                compareAtPrice
                inventoryQuantity
                sku
              }
            }
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

  const filterStatus = sp.get("status") || "all";
  const filterVendor = sp.get("vendor") || "";
  const filterType   = sp.get("type")   || "";

  // Paginar todos los productos
  let allProducts = [];
  let cursor      = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const res  = await admin.graphql(PRODUCTS_QUERY, { variables: { cursor } });
    const json = await res.json();
    const data = json.data.products;

    for (const edge of data.edges) {
      allProducts.push(edge.node);
      cursor = edge.cursor;
    }
    hasNextPage = data.pageInfo.hasNextPage;
  }

  // Normalizar
  const productos = allProducts.map((p) => {
    const variantes = p.variants.edges.map((e) => e.node);
    const precios   = variantes.map((v) => parseFloat(v.price));
    const precioMin = Math.min(...precios);
    const precioMax = Math.max(...precios);
    const stock     = variantes.reduce((s, v) => s + (v.inventoryQuantity || 0), 0);

    return {
      id:           p.id,
      titulo:       p.title,
      estado:       p.status,          // ACTIVE | DRAFT | ARCHIVED
      proveedor:    p.vendor || "—",
      tipo:         p.productType || "—",
      variantes:    variantes.length,
      stock:        stock,
      precioMin,
      precioMax,
      mismosPrecio: precioMin === precioMax,
    };
  });

  // Opciones únicas para filtros
  const vendores = [...new Set(allProducts.map((p) => p.vendor).filter(Boolean))].sort();
  const tipos    = [...new Set(allProducts.map((p) => p.productType).filter(Boolean))].sort();

  // Aplicar filtros
  let filtrados = productos;
  if (filterStatus !== "all") {
    filtrados = filtrados.filter((p) => p.estado.toUpperCase() === filterStatus.toUpperCase());
  }
  if (filterVendor) {
    filtrados = filtrados.filter((p) => p.proveedor === filterVendor);
  }
  if (filterType) {
    filtrados = filtrados.filter((p) => p.tipo === filterType);
  }

  // Resumen
  const totalStock    = filtrados.reduce((s, p) => s + p.stock, 0);
  const activos       = filtrados.filter((p) => p.estado === "ACTIVE").length;
  const sinStock      = filtrados.filter((p) => p.stock <= 0).length;

  return {
    productos: filtrados,
    resumen: { total: filtrados.length, totalStock, activos, sinStock },
    opciones: { vendores, tipos },
    filters: { status: filterStatus, vendor: filterVendor, type: filterType },
  };
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmtMXN = (n) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n);

const estadoLabel = (s) => {
  if (s === "ACTIVE")   return { text: "Activo",    bg: "#ceead6", color: "#1a7f4b" };
  if (s === "DRAFT")    return { text: "Borrador",  bg: "#fff3cd", color: "#856404" };
  if (s === "ARCHIVED") return { text: "Archivado", bg: "#e8e8e8", color: "#6d7175" };
  return { text: s, bg: "#e8e8e8", color: "#6d7175" };
};

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

const selectStyle = {
  border: "1px solid #8c9196",
  borderRadius: "4px",
  padding: "6px 10px",
  fontSize: "14px",
  color: "#202223",
  background: "#fff",
  outline: "none",
};

const statCardStyle = {
  flex: "1 1 140px",
  padding: "16px 20px",
  border: "1px solid #e1e3e5",
  borderRadius: "8px",
  background: "#fff",
};

// ─── Componente ──────────────────────────────────────────────────────────────

const spinnerStyle = {
  width: "36px",
  height: "36px",
  border: "3px solid #e1e3e5",
  borderTop: "3px solid #008060",
  borderRadius: "50%",
  animation: "spin 0.8s linear infinite",
};

export default function ProductosPage() {
  const { productos, resumen, opciones, filters } = useLoaderData();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  // ── Exportar CSV ────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const header = [
      "Producto", "Estado", "Proveedor", "Tipo",
      "Variantes", "Stock Total", "Precio Mín (MXN)", "Precio Máx (MXN)",
    ].join(",");

    const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;

    const lines = productos.map((p) =>
      [
        escape(p.titulo),
        p.estado,
        escape(p.proveedor),
        escape(p.tipo),
        p.variantes,
        p.stock,
        p.precioMin.toFixed(2),
        p.precioMax.toFixed(2),
      ].join(",")
    );

    const csv  = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    const today = new Date().toISOString().substring(0, 10);
    a.href     = url;
    a.download = `inventario_productos_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <s-page heading="Inventario de Productos">
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

      {/* ── Resumen ── */}
      <s-section heading="Resumen">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
          <div style={statCardStyle}>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "#202223" }}>
              {resumen.total}
            </div>
            <div style={{ fontSize: "13px", color: "#6d7175", marginTop: "2px" }}>
              Productos {filters.status !== "all" ? "filtrados" : "totales"}
            </div>
          </div>
          <div style={statCardStyle}>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "#1a7f4b" }}>
              {resumen.activos}
            </div>
            <div style={{ fontSize: "13px", color: "#6d7175", marginTop: "2px" }}>
              Activos
            </div>
          </div>
          <div style={statCardStyle}>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "#202223" }}>
              {resumen.totalStock.toLocaleString("es-MX")}
            </div>
            <div style={{ fontSize: "13px", color: "#6d7175", marginTop: "2px" }}>
              Unidades en stock
            </div>
          </div>
          <div style={statCardStyle}>
            <div
              style={{
                fontSize: "24px",
                fontWeight: "700",
                color: resumen.sinStock > 0 ? "#c0392b" : "#1a7f4b",
              }}
            >
              {resumen.sinStock}
            </div>
            <div style={{ fontSize: "13px", color: "#6d7175", marginTop: "2px" }}>
              Sin stock
            </div>
          </div>
        </div>
      </s-section>

      {/* ── Filtros ── */}
      <s-section heading="Filtros">
        <Form method="get" id="productos-form">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-end" }}>
            <div>
              <label style={labelStyle}>Estado</label>
              <select name="status" defaultValue={filters.status} style={selectStyle}>
                <option value="all">Todos</option>
                <option value="ACTIVE">Activo</option>
                <option value="DRAFT">Borrador</option>
                <option value="ARCHIVED">Archivado</option>
              </select>
            </div>

            {opciones.vendores.length > 0 && (
              <div>
                <label style={labelStyle}>Proveedor</label>
                <select name="vendor" defaultValue={filters.vendor} style={selectStyle}>
                  <option value="">Todos</option>
                  {opciones.vendores.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            )}

            {opciones.tipos.length > 0 && (
              <div>
                <label style={labelStyle}>Tipo de producto</label>
                <select name="type" defaultValue={filters.type} style={selectStyle}>
                  <option value="">Todos</option>
                  {opciones.tipos.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}

            <s-button
              variant="primary"
              onClick={() =>
                document.getElementById("productos-form").requestSubmit()
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
      {productos.length === 0 ? (
        <s-section heading="Sin resultados">
          <s-paragraph>
            No se encontraron productos con los filtros seleccionados.
          </s-paragraph>
        </s-section>
      ) : (
        <s-section heading={`${productos.length} producto${productos.length !== 1 ? "s" : ""}`}>
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
                  <th style={thStyle}>Producto</th>
                  <th style={thStyle}>Estado</th>
                  <th style={thStyle}>Proveedor</th>
                  <th style={thStyle}>Tipo</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Variantes</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Stock</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Precio</th>
                </tr>
              </thead>
              <tbody>
                {productos.map((p) => {
                  const estado = estadoLabel(p.estado);
                  const stockColor = p.stock <= 0 ? "#c0392b" : p.stock < 5 ? "#856404" : "#202223";

                  return (
                    <tr key={p.id}>
                      <td style={{ ...tdStyle, maxWidth: "280px" }}>
                        <span
                          style={{
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                            fontWeight: "500",
                          }}
                        >
                          {p.titulo}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 10px",
                            borderRadius: "20px",
                            background: estado.bg,
                            color: estado.color,
                            fontWeight: "600",
                            fontSize: "12px",
                          }}
                        >
                          {estado.text}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: "#6d7175" }}>{p.proveedor}</td>
                      <td style={{ ...tdStyle, color: "#6d7175" }}>{p.tipo}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{p.variantes}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: "600", color: stockColor }}>
                        {p.stock.toLocaleString("es-MX")}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {p.mismosPrecio
                          ? fmtMXN(p.precioMin)
                          : `${fmtMXN(p.precioMin)} – ${fmtMXN(p.precioMax)}`}
                      </td>
                    </tr>
                  );
                })}
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
