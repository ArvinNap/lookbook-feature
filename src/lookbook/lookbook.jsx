import { useEffect, useMemo, useState } from "react";

const METAOBJECT_TYPE = "lookbook";

function buildEndpoint({ shopDomain, apiVersion }) {
  return `https://${shopDomain}/api/${apiVersion}/graphql.json`;
}

async function storefrontFetch(config, query, variables) {
  const res = await fetch(buildEndpoint(config), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": config.storefrontAccessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Storefront API request failed: ${res.status}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data;
}

function parseMetaobjectFields(fields) {
  const byKey = Object.fromEntries(fields.map((f) => [f.key, f.value]));
  let productHandles = [];
  try {
    productHandles = byKey.products ? JSON.parse(byKey.products) : [];
  } catch {
    productHandles = [];
  }
  return {
    title: byKey.title || "",
    description: byKey.description || "",
    productHandles,
  };
}

const LOOKBOOK_BY_HANDLE_QUERY = `
  query LookbookByHandle($handle: String!) {
    metaobject(handle: { handle: $handle, type: "${METAOBJECT_TYPE}" }) {
      id
      handle
      fields { key value }
    }
  }
`;

const ALL_LOOKBOOKS_QUERY = `
  query AllLookbooks($first: Int!) {
    metaobjects(type: "${METAOBJECT_TYPE}", first: $first) {
      nodes {
        id
        handle
        fields { key value }
      }
    }
  }
`;

// The Storefront API has no "products by handle list" query, so we build one
// query with an aliased `product(handle: ...)` field per handle. Lookbooks
// are expected to hold a handful of products, so this stays well within
// Shopify's query cost limits.
function buildProductsQuery(handles, countryCode) {
  const aliases = handles
    .map(
      (handle, i) => `
        p${i}: product(handle: ${JSON.stringify(handle)}) {
          id
          title
          handle
          onlineStoreUrl
          featuredImage { url altText }
          priceRange { minVariantPrice { amount currencyCode } }
          compareAtPriceRange { minVariantPrice { amount currencyCode } }
        }
      `
    )
    .join("\n");

  return `
    query ProductsByHandles @inContext(country: ${countryCode}) {
      ${aliases}
    }
  `;
}

async function resolveProducts(config, handles) {
  if (!handles.length) return [];
  const data = await storefrontFetch(config, buildProductsQuery(handles, config.countryCode), {});
  return Object.values(data)
    .filter(Boolean)
    .map((product) => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      url: product.onlineStoreUrl || `/products/${product.handle}`,
      image: product.featuredImage,
      price: product.priceRange?.minVariantPrice,
      compareAtPrice: product.compareAtPriceRange?.minVariantPrice,
    }));
}

async function loadFixedLookbook(config) {
  if (!config.lookbookHandle) return [];
  const data = await storefrontFetch(config, LOOKBOOK_BY_HANDLE_QUERY, {
    handle: config.lookbookHandle,
  });
  if (!data.metaobject) return [];
  const parsed = parseMetaobjectFields(data.metaobject.fields);
  const products = await resolveProducts(config, parsed.productHandles);
  return [{ ...parsed, products }];
}

async function loadAutoLookbooks(config) {
  const data = await storefrontFetch(config, ALL_LOOKBOOKS_QUERY, { first: 50 });
  const nodes = data.metaobjects?.nodes || [];

  // A product can belong to several lookbooks; cap at maxLookbooks (2) so a
  // product page never gets flooded with every lookbook it's in.
  const matching = nodes
    .map((node) => parseMetaobjectFields(node.fields))
    .filter((lb) => lb.productHandles.includes(config.currentProductHandle))
    .slice(0, config.maxLookbooks || 2);

  const withProducts = [];
  for (const lb of matching) {
    const products = await resolveProducts(config, lb.productHandles);
    withProducts.push({ ...lb, products });
  }
  return withProducts;
}

function formatMoney(money) {
  if (!money) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: money.currencyCode,
    }).format(Number(money.amount));
  } catch {
    return `${money.amount} ${money.currencyCode}`;
  }
}

function ProductCard({ product }) {
  const hasDiscount =
    product.compareAtPrice && Number(product.compareAtPrice.amount) > Number(product.price?.amount || 0);

  return (
    <a className="lookbook-card" href={product.url}>
      {product.image ? (
        <img
          className="lookbook-card__image"
          src={product.image.url}
          alt={product.image.altText || product.title}
          loading="lazy"
        />
      ) : (
        <div className="lookbook-card__image lookbook-card__image--placeholder" aria-hidden="true" />
      )}
      <div className="lookbook-card__title">{product.title}</div>
      <div className="lookbook-card__price">
        {hasDiscount && <s className="lookbook-card__compare-at">{formatMoney(product.compareAtPrice)}</s>}
        <span>{formatMoney(product.price)}</span>
      </div>
    </a>
  );
}

function LookbookBlock({ lookbook, columns }) {
  if (!lookbook.products.length) return null;
  return (
    <div className="lookbook-block">
      {lookbook.title && <h3 className="lookbook-block__title">{lookbook.title}</h3>}
      {lookbook.description && <p className="lookbook-block__description">{lookbook.description}</p>}
      <div className="lookbook-grid" style={{ "--columns": columns }}>
        {lookbook.products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}

export default function Lookbook(config) {
  const [lookbooks, setLookbooks] = useState(null);
  const [error, setError] = useState(null);

  const loader = useMemo(() => (config.mode === "fixed" ? loadFixedLookbook : loadAutoLookbooks), [config.mode]);

  useEffect(() => {
    let cancelled = false;

    loader(config)
      .then((result) => {
        if (!cancelled) setLookbooks(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
    // Re-run only when the inputs that change *which* lookbook(s) to show actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.mode, config.lookbookHandle, config.currentProductHandle]);

  if (error) {
    return <p className="lookbook-section__error">Couldn&apos;t load the lookbook right now.</p>;
  }

  if (!lookbooks) {
    return <p className="lookbook-section__placeholder">Loading lookbook…</p>;
  }

  if (!lookbooks.length) {
    return null;
  }

  return (
    <div className="lookbook-wrapper">
      {lookbooks.map((lookbook, i) => (
        <LookbookBlock key={`${lookbook.title}-${i}`} lookbook={lookbook} columns={config.columns || 4} />
      ))}
    </div>
  );
}