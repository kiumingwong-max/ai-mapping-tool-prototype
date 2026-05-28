// Sample CSVs used by the prototype's "Try a sample" affordances and by the Tweaks scenario picker.

window.SAMPLES = {
  // ── Clean: headers mostly recognizable, all rows valid ─────────────────
  clean: {
    name: "spring-2026-catalog.csv",
    rows: 84,
    csv:
`Style Code,Product Name,Brand,Wholesale Price,Colorway,Size,Season,Style Number,Description,Category
TF-0421-BLK-S,Featherweight Hoodie,True Field,38.50,Onyx Black,S,SS26,TF-0421,Brushed-fleece pullover with kangaroo pocket,Tops
TF-0421-BLK-M,Featherweight Hoodie,True Field,38.50,Onyx Black,M,SS26,TF-0421,Brushed-fleece pullover with kangaroo pocket,Tops
TF-0421-BLK-L,Featherweight Hoodie,True Field,38.50,Onyx Black,L,SS26,TF-0421,Brushed-fleece pullover with kangaroo pocket,Tops
TF-0421-OAT-S,Featherweight Hoodie,True Field,38.50,Oat Heather,S,SS26,TF-0421,Brushed-fleece pullover with kangaroo pocket,Tops
TF-0421-OAT-M,Featherweight Hoodie,True Field,38.50,Oat Heather,M,SS26,TF-0421,Brushed-fleece pullover with kangaroo pocket,Tops
TF-0388-NVY-30,Field Chino,True Field,46.00,Deep Navy,30,SS26,TF-0388,Mid-rise straight-leg chino,Bottoms
TF-0388-NVY-32,Field Chino,True Field,46.00,Deep Navy,32,SS26,TF-0388,Mid-rise straight-leg chino,Bottoms
TF-0388-NVY-34,Field Chino,True Field,46.00,Deep Navy,34,SS26,TF-0388,Mid-rise straight-leg chino,Bottoms
TF-0512-SND-OS,Camp Cap,True Field,18.00,Sand,OS,SS26,TF-0512,Six-panel cotton twill cap,Accessories
TF-0512-OLV-OS,Camp Cap,True Field,18.00,Forest Olive,OS,SS26,TF-0512,Six-panel cotton twill cap,Accessories`
  },

  // ── Messy headers: some won't auto-map (test reviewer UI) ──────────────
  ambiguous: {
    name: "wholesale-line-q2.xlsx",
    rows: 47,
    csv:
`Item Ref,Article Title,House,Cost (USD),Shade,Sz,Year/Season,Notes,Dept,Lead Time
AC-9001,Linen Camp Shirt,Atelier Coast,32.00,Sea Salt,S,SS26,100% French linen,Tops,45d
AC-9001-M,Linen Camp Shirt,Atelier Coast,32.00,Sea Salt,M,SS26,100% French linen,Tops,45d
AC-9001-L,Linen Camp Shirt,Atelier Coast,32.00,Sea Salt,L,SS26,100% French linen,Tops,45d
AC-9004,Rope Belt,Atelier Coast,12.50,Natural,OS,SS26,Hand-braided cotton rope,Accessories,30d
AC-9004-BLK,Rope Belt,Atelier Coast,12.50,Carbon,OS,SS26,Hand-braided cotton rope,Accessories,30d
AC-9012,Sun Hat,Atelier Coast,24.00,Straw,OS,SS26,Wide-brim raffia,Accessories,60d`
  },

  // ── Errors: missing brand, bad price, duplicate SKUs ──────────────────
  errors: {
    name: "fall-restock.csv",
    rows: 28,
    csv:
`SKU,Product Name,Brand,Wholesale Price,Color,Size
RV-101,Trail Crew Tee,Ridgeview,22.00,Mountain Green,S
RV-101,Trail Crew Tee,Ridgeview,22.00,Mountain Green,S
RV-102,Trail Crew Tee,Ridgeview,22.00,Mountain Green,M
RV-103,Trail Crew Tee,,22.00,Mountain Green,L
RV-104,,Ridgeview,22.00,Sunset,S
RV-105,Switchback Short,Ridgeview,ABC,Charcoal,M
RV-106,Switchback Short,Ridgeview,29.50,Charcoal,L
RV-107,Switchback Short,Ridgeview,29.50,Charcoal,XL
RV-108,Basecamp Cap,Ridgeview,16.00,Khaki,OS
RV-109,Basecamp Cap,Ridgeview,price on req,Khaki,OS
RV-102,Trail Crew Tee,Ridgeview,22.00,Mountain Green,M
RV-110,Basecamp Cap,Ridgeview,16.00,Black,OS`
  }
};

// NuORDER target schema — expanded to align with the Shopify product taxonomy.
// Grouped for the mapping dropdown so 50+ fields stay scannable.
//
// References:
//   • Shopify CSV product columns (Handle, Title, Vendor, Variant SKU, Variant Price, …)
//   • Shopify Standard Product Taxonomy attributes
//     (color, size, material, neckline, sleeve_length_type, age_group, target_gender, …)
//   • Shopify product-taxonomy github.com/Shopify/product-taxonomy

window.TARGET_SCHEMA_GROUPS = [
  {
    id: "core",
    label: "Core identity",
    icon: "tag",
    fields: [
      { id: "product_name",        label: "Product name",         required: true,  hint: "Shopify: Title" },
      { id: "brand_name",          label: "Brand name",           required: true,  hint: "Shopify: Vendor" },
      { id: "handle",              label: "Handle / slug",        hint: "URL-safe identifier" },
      { id: "product_description", label: "Description",          hint: "Body (HTML)" },
      { id: "product_type",        label: "Product type",         hint: "Shopify: Type" },
      { id: "status",              label: "Status",               hint: "active · draft · archived" },
    ]
  },
  {
    id: "identifiers",
    label: "Identifiers",
    icon: "barcode",
    fields: [
      { id: "sku",            label: "SKU",                   hint: "Variant SKU" },
      { id: "style_number",   label: "Style number",          hint: "Brand internal code" },
      { id: "barcode",        label: "Barcode (UPC / EAN)",   hint: "Variant Barcode" },
      { id: "mpn",            label: "MPN",                   hint: "Manufacturer part number" },
      { id: "gtin",           label: "GTIN" },
    ]
  },
  {
    id: "pricing",
    label: "Pricing",
    icon: "dollar-sign",
    fields: [
      { id: "wholesale_price",     label: "Wholesale price", type: "number" },
      { id: "retail_price",        label: "Retail price",      type: "number", hint: "MSRP" },
      { id: "compare_at_price",    label: "Compare-at price",  type: "number" },
      { id: "cost_price",          label: "Cost price",        type: "number" },
      { id: "currency",            label: "Currency",          hint: "ISO 4217 · USD, EUR" },
      { id: "price_catalog",       label: "Price catalog",     hint: "EUR/EXW · USD/DDP" },
    ]
  },
  {
    id: "variants",
    label: "Variant attributes",
    icon: "palette",
    fields: [
      // Shopify standard variant attributes
      { id: "color",          label: "Color",            hint: "Shopify attribute: color" },
      { id: "color_pattern",  label: "Color pattern",    hint: "Solid · striped · printed" },
      { id: "size",           label: "Size",             hint: "Shopify attribute: size" },
      { id: "size_system",    label: "Size system",      hint: "US · EU · UK · alpha" },
      { id: "material",       label: "Material",         hint: "Shopify attribute: material" },
      { id: "pattern",        label: "Pattern",          hint: "Shopify attribute: pattern" },
      { id: "fabric",         label: "Fabric",           hint: "Composition / fiber" },
      { id: "fit",            label: "Fit",              hint: "Slim · regular · relaxed" },
    ]
  },
  {
    id: "categorization",
    label: "Categorization",
    icon: "folder-tree",
    fields: [
      { id: "product_category",   label: "Product category",     hint: "Shopify taxonomy: Apparel > Tops > T-shirts" },
      { id: "subcategory",        label: "Subcategory" },
      { id: "collection",         label: "Collection",           hint: "FW25 Women · SS26" },
      { id: "season",             label: "Season",               hint: "SS · FW · cruise" },
      { id: "line",               label: "Line",                 hint: "Womens · Mens · Kids" },
      { id: "tags",               label: "Tags" },
    ]
  },
  {
    id: "apparel",
    label: "Apparel attributes",
    icon: "tshirt",
    fields: [
      // Shopify apparel-vertical taxonomy attributes
      { id: "target_gender",          label: "Target gender",         hint: "Womens · Mens · Unisex" },
      { id: "age_group",              label: "Age group",             hint: "Adult · Kids · Baby" },
      { id: "neckline",               label: "Neckline",              hint: "Crew · V-neck · scoop" },
      { id: "sleeve_length_type",     label: "Sleeve length",         hint: "Short · long · 3/4" },
      { id: "top_length_type",        label: "Top length",            hint: "Cropped · regular · longline" },
      { id: "bottom_length_type",     label: "Bottom length",         hint: "Mini · midi · maxi" },
      { id: "waist_rise",             label: "Waist rise",            hint: "Low · mid · high" },
      { id: "inseam_length",          label: "Inseam length", type: "number" },
      { id: "closure_type",           label: "Closure type",          hint: "Zip · button · pullover" },
    ]
  },
  {
    id: "footwear",
    label: "Footwear & accessories",
    icon: "shoe-prints",
    fields: [
      { id: "shoe_size",       label: "Shoe size",       hint: "US 7 · EU 38" },
      { id: "shoe_width",      label: "Shoe width" },
      { id: "heel_height",     label: "Heel height" },
      { id: "toe_shape",       label: "Toe shape" },
      { id: "ring_size",       label: "Ring size" },
      { id: "stone_type",      label: "Stone type",      hint: "Jewelry attribute" },
    ]
  },
  {
    id: "operational",
    label: "Operational",
    icon: "industry",
    fields: [
      { id: "weight",             label: "Weight", type: "number" },
      { id: "weight_unit",        label: "Weight unit",          hint: "g · kg · oz · lb" },
      { id: "country_of_origin",  label: "Country of origin",    hint: "Shopify: Made in" },
      { id: "composition",        label: "Composition",          hint: "98% cotton · 2% spandex" },
      { id: "care_instructions",  label: "Care instructions" },
      { id: "lead_time",          label: "Lead time" },
      { id: "ship_start_date",    label: "Ship start date" },
      { id: "ship_end_date",      label: "Ship end date" },
    ]
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: "boxes-stacked",
    fields: [
      { id: "inventory_qty",      label: "Inventory qty",        type: "number" },
      { id: "inventory_policy",   label: "Inventory policy",     hint: "Continue · deny when oos" },
      { id: "minimum_order_qty",  label: "Minimum order qty",    type: "number" },
      { id: "case_pack",          label: "Case pack",            type: "number" },
    ]
  },
  {
    id: "media",
    label: "Media",
    icon: "image",
    fields: [
      { id: "image_url",          label: "Image URL",            hint: "Shopify: Image Src" },
      { id: "image_alt",          label: "Image alt text" },
      { id: "image_position",     label: "Image position", type: "number" },
      { id: "variant_image_url",  label: "Variant image URL" },
    ]
  },
  {
    id: "seo",
    label: "SEO",
    icon: "magnifying-glass",
    fields: [
      { id: "seo_title",          label: "SEO title" },
      { id: "seo_description",    label: "SEO description" },
    ]
  },
];

// Flat lookup that the rest of the app uses unchanged.
window.TARGET_SCHEMA = window.TARGET_SCHEMA_GROUPS.flatMap(g => g.fields.map(f => ({ ...f, group: g.id, groupLabel: g.label })));
