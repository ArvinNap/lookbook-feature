const store = process.env.SHOPIFY_STORE;
const token = process.env.SHOPIFY_ADMIN_TOKEN;
const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION || "2026-01";

if (!store || !token) {
  console.error("Set SHOPIFY_STORE and SHOPIFY_ADMIN_TOKEN environment variables first.");
  process.exit(1);
}

const mutation = `
  mutation CreateLookbookDefinition($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition {
        id
        type
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const variables = {
  definition: {
    type: "lookbook",
    name: "Lookbook",
    access: { storefront: "PUBLIC_READ" },
    capabilities: { publishable: { enabled: true } },
    fieldDefinitions: [
      { key: "title", name: "Title", type: "single_line_text_field", required: true },
      { key: "description", name: "Description", type: "multi_line_text_field", required: false },
      {
        key: "products",
        name: "Product handles",
        type: "list.single_line_text_field",
        required: true,
        description: "Ordered list of product handles in this lookbook. Handles only.",
      },
    ],
  },
};

const response = await fetch(`https://${store}/admin/api/${apiVersion}/graphql.json`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": token,
  },
  body: JSON.stringify({ query: mutation, variables }),
});

const json = await response.json();
const result = json?.data?.metaobjectDefinitionCreate;

if (result?.userErrors?.length) {
  console.error("Shopify rejected the definition:");
  console.error(result.userErrors);
  process.exit(1);
}

console.log("Lookbook metaobject definition created:");
console.log(JSON.stringify(result?.metaobjectDefinition ?? json, null, 2));