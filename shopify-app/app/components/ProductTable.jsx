import { IndexTable, Text, Thumbnail } from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";

const isValidImage = (value) =>
  typeof value === "string" &&
  /^(https?:\/\/|\/|data:image\/)/i.test(value.trim());

export default function ProductTable({ products }) {
  return (
    <IndexTable
      resourceName={{ singular: "product", plural: "products" }}
      itemCount={products.length}
      selectable={false}
      headings={[
        { title: "Product" },
        { title: "Recommended" },
        { title: "CTR" },
        { title: "Revenue" },
      ]}
    >
      {products.map((product, index) => (
        <IndexTable.Row id={product.id} key={product.id} position={index}>
          <IndexTable.Cell>
            <div className="ai-inline-stack">
              <Thumbnail
                source={isValidImage(product.image) ? product.image : ImageIcon}
                alt={product.title}
                size="small"
              />
              <Text variant="bodyMd" fontWeight="medium">
                {product.title}
              </Text>
            </div>
          </IndexTable.Cell>
          <IndexTable.Cell>{product.recommendedCount}</IndexTable.Cell>
          <IndexTable.Cell>
            {typeof product.ctr === "number" ? `${product.ctr}%` : product.ctr || "-"}
          </IndexTable.Cell>
          <IndexTable.Cell>
            ${Number(product.revenue || 0).toFixed(2)}
          </IndexTable.Cell>
        </IndexTable.Row>
      ))}
    </IndexTable>
  );
}
