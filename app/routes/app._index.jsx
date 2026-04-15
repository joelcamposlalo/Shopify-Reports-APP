import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

const cardStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  padding: "20px 24px",
  border: "1px solid #e1e3e5",
  borderRadius: "8px",
  background: "#fff",
};

const iconStyle = {
  fontSize: "28px",
  marginBottom: "4px",
};

const titleStyle = {
  fontSize: "16px",
  fontWeight: "600",
  color: "#202223",
  margin: 0,
};

const descStyle = {
  fontSize: "13px",
  color: "#6d7175",
  margin: 0,
};

export default function HomePage() {
  return (
    <s-page heading="ReportesAPI">
      <s-section heading="Reportes disponibles">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: "16px",
          }}
        >
          <s-link href="/app/clientes" style={cardStyle}>
            <span style={iconStyle}>🧑‍💼</span>
            <p style={titleStyle}>Clientes</p>
            <p style={descStyle}>
              Filtra clientes por período, ve cuánto gastaron, cuántas órdenes
              hicieron y exporta el listado a CSV.
            </p>
          </s-link>

          <s-link href="/app/retention" style={cardStyle}>
            <span style={iconStyle}>👥</span>
            <p style={titleStyle}>Retención de Clientes</p>
            <p style={descStyle}>
              Analiza cuántos clientes nuevos regresan a comprar y en qué
              ventana de tiempo lo hacen.
            </p>
          </s-link>

          <s-link href="/app/productos" style={cardStyle}>
            <span style={iconStyle}>📦</span>
            <p style={titleStyle}>Inventario de Productos</p>
            <p style={descStyle}>
              Resumen de productos activos, stock disponible y rango de precios
              por variante.
            </p>
          </s-link>
        </div>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
